"""Turn an uploaded file into text, checking what the file really is.

The file's contents decide its type, not its name or the type the browser
claims. Every failure is an UploadError carrying the HTTP status to return:
415 for the wrong kind of file, 413 for a limit, 422 for a file that can't
give any text.
"""

import io
import re
import unicodedata
import zipfile
from pathlib import PurePosixPath

from app.core.config import settings

ALLOWED_EXTENSIONS = (".pdf", ".docx", ".txt", ".md")


class UploadError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def unsupported(message: str) -> UploadError:
    return UploadError(415, message)


def too_large(message: str) -> UploadError:
    return UploadError(413, message + " Split the document into smaller files and upload them separately.")


def clean_filename(filename: str | None) -> str:
    """A safe display name: no folders, no control characters, at most 255 characters.

    Only ever stored and shown, never used as a path on disk.
    """
    name = (filename or "").replace("\\", "/")
    name = PurePosixPath(name).name  # drops any folders, including "../"
    name = "".join(ch for ch in name if unicodedata.category(ch)[0] != "C")  # control characters
    name = re.sub(r"\s+", " ", name).strip(" .")
    if len(name) > 255:
        stem, dot, ext = name.rpartition(".")
        name = stem[: 255 - len(ext) - 1] + dot + ext if dot else name[:255]
    return name or "upload"


def extension_of(filename: str) -> str:
    suffix = PurePosixPath(filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise unsupported("Only .pdf, .docx, .txt and .md files can be uploaded.")
    return suffix


def _pdf_text(data: bytes) -> str:
    from pypdf import PdfReader
    from pypdf.errors import PdfReadError

    if not data.startswith(b"%PDF-"):
        raise unsupported("This file is named .pdf but its contents are not a PDF.")
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise UploadError(422, "This PDF is password protected. Upload a copy without a password.")
        pages = len(reader.pages)
    except PdfReadError:
        raise UploadError(422, "This PDF could not be read. It may be damaged.")
    if pages > settings.upload_max_pdf_pages:
        raise too_large(f"This PDF has {pages} pages; the limit is {settings.upload_max_pdf_pages}.")
    try:
        return "\n\n".join((page.extract_text() or "").strip() for page in reader.pages)
    except Exception:
        raise UploadError(422, "The text of this PDF could not be read. It may be damaged.")


# Word's built in heading styles become Markdown sections. "# " is avoided:
# the chunker treats a top level heading as the document title.
_DOCX_HEADINGS = {"Title": "##", "Heading 1": "##", "Heading 2": "###", "Heading 3": "####"}


def _docx_text(data: bytes) -> str:
    from docx import Document as WordDocument

    if not zipfile.is_zipfile(io.BytesIO(data)):
        raise unsupported("This file is named .docx but its contents are not a Word document.")
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        if "word/document.xml" not in archive.namelist():
            raise unsupported("This file is named .docx but its contents are not a Word document.")
        # A small zip can unpack to gigabytes: check before parsing anything
        unpacked = sum(info.file_size for info in archive.infolist())
    if unpacked > settings.upload_max_docx_uncompressed_bytes:
        raise too_large(
            f"This Word document unpacks to {unpacked // (1024 * 1024)} MB; "
            f"the limit is {settings.upload_max_docx_uncompressed_bytes // (1024 * 1024)} MB."
        )
    try:
        word = WordDocument(io.BytesIO(data))
    except Exception:
        raise UploadError(422, "This Word document could not be read. It may be damaged.")

    lines = []
    for paragraph in word.paragraphs:
        text = paragraph.text.strip()
        if not text:
            continue
        marker = _DOCX_HEADINGS.get(paragraph.style.name if paragraph.style is not None else "")
        lines.append(f"{marker} {text}" if marker else text)
    for table in word.tables:
        for row in table.rows:
            cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
            if cells:
                lines.append(" | ".join(cells))
    return "\n\n".join(lines)


def _plain_text(data: bytes) -> str:
    if b"\x00" in data:
        raise unsupported("This file contains binary data, not text.")
    try:
        return data.decode("utf-8-sig")  # UTF-8, with or without a byte order mark
    except UnicodeDecodeError:
        raise unsupported("Text files must be saved as UTF-8. Save the file as UTF-8 and try again.")


def extract_text(filename: str, data: bytes) -> str:
    """The file's text, ready for chunking. Raises UploadError."""
    extension = extension_of(filename)
    if extension == ".pdf":
        text = _pdf_text(data)
    elif extension == ".docx":
        text = _docx_text(data)
    else:
        text = _plain_text(data)

    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if not text:
        raise UploadError(
            422,
            "No text could be found in this file. Scanned documents (pictures of pages) "
            "are not supported; upload a file that contains real text.",
        )
    if len(text) > settings.upload_max_chars:
        raise too_large(f"This file has {len(text):,} characters of text; the limit is {settings.upload_max_chars:,}.")
    return text
