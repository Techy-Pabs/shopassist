import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from app.core.config import settings
from app.db.checks import check_embedding_dimensions
from app.db.session import engine
from app.routers import admin, auth, conversations

# Show INFO logs from our own modules (e.g. which AI model answered)
logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(name)s: %(message)s")
# httpx (used by the openai library) would otherwise log every request it makes
logging.getLogger("httpx").setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Runs once at startup: warn loudly if the embedding settings and the
    # database disagree, instead of failing later on the first search
    check_embedding_dimensions(engine)
    yield


app = FastAPI(title="ShopAssist", lifespan=lifespan)


# Room for the multipart wrapping and the title field around the file itself
UPLOAD_OVERHEAD_BYTES = 64 * 1024


@app.middleware("http")
async def reject_oversized_uploads(request: Request, call_next):
    # Turn away an upload that declares its size as too large before reading
    # its body. Uploads that don't declare a size are still stopped while
    # reading (see read_limited).
    if request.method == "POST" and request.url.path == "/admin/knowledge/documents":
        declared = request.headers.get("content-length", "")
        if declared.isdigit() and int(declared) > settings.upload_max_file_bytes + UPLOAD_OVERHEAD_BYTES:
            limit_mb = settings.upload_max_file_bytes // (1024 * 1024)
            return JSONResponse(
                status_code=413,
                content={"detail": f"This file is over the {limit_mb} MB upload limit. Split the "
                                   "document into smaller files and upload them separately."},
            )
    return await call_next(request)


@app.exception_handler(RequestValidationError)
def validation_error_handler(request: Request, exc: RequestValidationError):
    # FastAPI's default 422 response echoes back the invalid value, which
    # could be a password. Send the error details without the "input".
    errors = [{k: v for k, v in e.items() if k != "input"} for e in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": jsonable_encoder(errors)})


# Let the frontend (e.g. on Vercel) call the API from the browser. Added
# last so it wraps every response, including the upload size check's 413.
# No credentials: the API uses an Authorization header, not cookies.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=600,
)

app.include_router(auth.router)
app.include_router(conversations.router)
app.include_router(admin.router)


# Visiting the base URL opens the Swagger page. Hidden from the docs themselves.
@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/docs")


@app.get("/health")
def health():
    return {"status": "ok", "service": "shopassist"}
