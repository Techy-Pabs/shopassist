import { SESSION_ENDED_MESSAGE, createApiClient } from './client.js'
import { fakeFetch } from '../test/fakeApi.js'

function client(routes, token = null) {
  const onSessionEnded = vi.fn()
  const fetch = fakeFetch(routes)
  const api = createApiClient({ baseUrl: 'http://api.test/', getToken: () => token, onSessionEnded, fetchImpl: fetch })
  return { api, fetch, onSessionEnded }
}

describe('API client', () => {
  it('returns data on success and adds the token when there is one', async () => {
    const { api, fetch } = client({ 'GET /auth/me': { status: 200, body: { email: 'a@example.com' } } }, 'tok')

    const result = await api.me()

    expect(result).toEqual({ ok: true, status: 200, data: { email: 'a@example.com' } })
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/auth/me') // no double slash
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok')
  })

  it('never sends the token with sign in', async () => {
    const { api, fetch } = client({ 'POST /auth/login': { status: 200, body: { access_token: 'x' } } }, 'old-token')

    await api.login('a@example.com', 'password1')

    expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined()
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ email: 'a@example.com', password: 'password1' })
  })

  it('a 401 on a call made with a token ends the session', async () => {
    const { api, onSessionEnded } = client({ 'GET /auth/me': { status: 401, body: { detail: 'Could not validate credentials' } } }, 'tok')

    const result = await api.me()

    expect(result).toMatchObject({ ok: false, kind: 'session-ended', message: SESSION_ENDED_MESSAGE })
    expect(onSessionEnded).toHaveBeenCalledOnce()
  })

  it('a 401 without a token is just a wrong email or password', async () => {
    const { api, onSessionEnded } = client({ 'POST /auth/login': { status: 401, body: { detail: 'Incorrect email or password' } } })

    const result = await api.login('a@example.com', 'wrong-password')

    expect(result).toMatchObject({ ok: false, kind: 'unauthorized', message: 'Incorrect email or password' })
    expect(onSessionEnded).not.toHaveBeenCalled()
  })

  it('turns 422 details into messages per field', async () => {
    const { api } = client({
      'POST /auth/register': {
        status: 422,
        body: { detail: [
          { loc: ['body', 'email'], msg: 'value is not a valid email address: An email address must have an @-sign.' },
          { loc: ['body', 'password'], msg: 'String should have at least 8 characters' },
          { loc: ['body', 'password'], msg: 'A second message for the same field' },
        ] },
      },
    })

    const result = await api.register('nope', 'short')

    expect(result.kind).toBe('validation')
    expect(result.fieldErrors).toEqual({
      email: 'Value is not a valid email address: An email address must have an @-sign.',
      password: 'String should have at least 8 characters',
    })
  })

  it('removes pydantic\'s "Value error, " prefix', async () => {
    const { api } = client({ 'POST /auth/login': { status: 422, body: { detail: [{ loc: ['body', 'email'], msg: 'Value error, something odd' }] } } })

    expect((await api.login('x', 'y')).fieldErrors.email).toBe('Something odd')
  })

  it('a 502 is "unavailable" with the server message', async () => {
    const { api } = client({ 'GET /auth/me': { status: 502, body: { detail: 'The assistant is unavailable right now.' } } }, 'tok')

    expect(await api.me()).toMatchObject({ kind: 'unavailable', message: 'The assistant is unavailable right now.' })
  })

  it('no response at all is a network failure', async () => {
    const { api } = client({ 'GET /health': () => new TypeError('Failed to fetch') })

    const result = await api.health()

    expect(result).toMatchObject({ ok: false, kind: 'network', status: 0 })
    expect(result.message).toMatch(/couldn't reach/)
  })

  it('other errors keep the server message', async () => {
    const { api } = client({ 'POST /auth/register': { status: 400, body: { detail: 'Email already registered' } } })

    expect(await api.register('a@example.com', 'password1')).toMatchObject({ kind: 'error', status: 400, message: 'Email already registered' })
  })
})
