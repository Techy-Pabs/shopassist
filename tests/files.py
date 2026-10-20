"""Small test files, built in memory."""

import io


def make_pdf(pages: list[str | None]) -> bytes:
    """A real PDF with one page per item. None makes a page with no text,
    like a scanned page. Text lines are separated by "\\n".
    """
    objects = ["<< /Type /Catalog /Pages 2 0 R >>", None, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    page_ids = []
    for text in pages:
        lines = (text or "").split("\n") if text else []
        escaped = [line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)") for line in lines]
        stream = "BT /F1 12 Tf 14 TL 50 750 Td " + " ".join(f"({line}) Tj T*" for line in escaped) + " ET"
        objects.append(f"<< /Length {len(stream)} >>\nstream\n{stream}\nendstream")
        content_id = len(objects)
        objects.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            f"/Resources << /Font << /F1 3 0 R >> >> /Contents {content_id} 0 R >>"
        )
        page_ids.append(len(objects))
    objects[1] = f"<< /Type /Pages /Kids [{' '.join(f'{i} 0 R' for i in page_ids)}] /Count {len(page_ids)} >>"

    out = io.BytesIO()
    out.write(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, 1):
        offsets.append(out.tell())
        out.write(f"{number} 0 obj\n{body}\nendobj\n".encode("latin-1"))
    xref = out.tell()
    out.write(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode())
    for offset in offsets:
        out.write(f"{offset:010d} 00000 n \n".encode())
    out.write(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    return out.getvalue()


def make_encrypted_pdf() -> bytes:
    from pypdf import PdfWriter

    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    writer.encrypt("a-password")
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def make_docx(blocks: list[tuple[str, str]]) -> bytes:
    """blocks: (style, text) pairs, e.g. ("Heading 1", "Returns"), ("Normal", "...")."""
    from docx import Document

    document = Document()
    for style, text in blocks:
        document.add_paragraph(text, style=style)
    out = io.BytesIO()
    document.save(out)
    return out.getvalue()
