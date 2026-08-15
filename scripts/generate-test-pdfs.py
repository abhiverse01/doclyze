#!/usr/bin/env python3
"""
Generate real PDFs for v7 live verification testing.
These are NOT fixtures shaped to fit the fix — they are real PDFs
created through standard PDF-generation paths that simulate
the structural profiles of the original failure document.

Three documents:
1. lecture-slides.pdf — Multi-heading, 2-column term/definition table, URL with trailing punctuation
2. narrow-columns.pdf — Three-column layout on Letter (stresses column detection)
3. multi-table.pdf — Multiple tables with varying column counts on A4
"""

from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.units import inch, mm
from reportlab.lib.colors import HexColor, black, white
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
import os

OUTPUT_DIR = "/home/z/my-project/scripts/test-pdfs"
os.makedirs(OUTPUT_DIR, exist_ok=True)


# ─────────────────────────────────────────────────────────────────────────────
# PDF 1: Lecture Slides (simulates web-programming-day1.pdf)
# ─────────────────────────────────────────────────────────────────────────────

def generate_lecture_slides():
    """Generate a lecture-slide style PDF with:
    - Multiple headings at different font sizes
    - A 2-column term/definition table (the original failure case)
    - A URL with trailing double-quote
    - Many capitalized phrases that are headings, not entities
    """
    path = os.path.join(OUTPUT_DIR, "lecture-slides.pdf")
    c = canvas.Canvas(path, pagesize=letter)
    width, height = letter  # 612 x 792 pt

    # --- Slide 1: Title slide ---
    # Big title (font 28)
    c.setFont("Helvetica-Bold", 28)
    c.drawCentredString(width / 2, height - 72, "WEB PROGRAMMING")

    # Subtitle (font 22)
    c.setFont("Helvetica", 22)
    c.drawCentredString(width / 2, height - 110, "Day 1 — Introduction")

    # Body text (font 14)
    c.setFont("Helvetica", 14)
    c.drawString(72, height - 180, "Welcome to Web Programming! In this course we will cover")
    c.drawString(72, height - 200, "the three core languages of the web: HTML, CSS, and JavaScript.")

    # URL with trailing double-quote (the Defect #1 trigger)
    c.setFont("Helvetica", 14)
    c.drawString(72, height - 260, 'Visit https://github.com/abhiverse01" for the course repository.')

    # Contact email
    c.drawString(72, height - 300, "Contact: instructor@university.edu for questions.")

    c.showPage()

    # --- Slide 2: Section headings ---
    # H1: The Big Picture (font 24)
    c.setFont("Helvetica-Bold", 24)
    c.drawString(72, height - 60, "The Big Picture")

    # H2: Three Languages (font 18)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(72, height - 110, "Three Languages")

    c.setFont("Helvetica", 14)
    c.drawString(72, height - 140, "Web development relies on three core languages working together:")
    c.drawString(72, height - 160, "HTML for structure, CSS for presentation, JavaScript for behavior.")

    # H2: Two Sides (font 18)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(72, height - 210, "Two Sides")

    c.setFont("Helvetica", 14)
    c.drawString(72, height - 240, "Every web application has a client side (browser) and a server side.")
    c.drawString(72, height - 260, "We will focus on the client side in this course.")

    # H2: Before We Begin (font 18)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(72, height - 310, "Before We Begin")

    c.setFont("Helvetica", 14)
    c.drawString(72, height - 340, "Make sure you have a modern browser and a code editor installed.")

    c.showPage()

    # --- Slide 3: Term/Definition Table (the Defect #3 trigger) ---
    # H2: Core Terminology (font 18)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(72, height - 50, "Core Terminology")

    # 2-column table: Term (left, x=72) | Definition (right, x=250)
    # This mimics the original failure case where flattened text interleaved columns
    terms = [
        ("HTML", "HyperText Markup Language — the standard language for creating web pages"),
        ("CSS", "Cascading Style Sheets — controls the presentation and layout of web pages"),
        ("DOM", "Document Object Model — a programming interface for web documents"),
        ("Attribute", "A property that provides additional information about an HTML element"),
        ("Client", "The user's browser or device that requests and displays web pages"),
        ("Browser", "Software application used to access and view web pages on the internet"),
        ("Frontend", "Everything the user sees and interacts with directly in the browser"),
        ("Rendering", "The process of converting HTML/CSS/JavaScript into a visual display on screen"),
    ]

    # Table header
    y = height - 90
    c.setFont("Helvetica-Bold", 13)
    c.drawString(72, y, "Term")
    c.drawString(250, y, "Definition")

    # Table rows
    c.setFont("Helvetica", 12)
    for i, (term, definition) in enumerate(terms):
        y -= 22
        c.drawString(72, y, term)
        c.drawString(250, y, definition)

    # H3: Tools You Use Every Day (font 15)
    y -= 50
    c.setFont("Helvetica-Bold", 15)
    c.drawString(72, y, "Tools You Use Every Day")

    c.setFont("Helvetica", 14)
    y -= 22
    c.drawString(72, y, "Text editors, browsers, developer tools, and version control systems.")

    # Another URL for good measure
    y -= 40
    c.drawString(72, y, 'See also: https://developer.mozilla.org/en-US/docs/Web" for reference.')

    c.showPage()
    c.save()
    print(f"Generated: {path}")
    return path


# ─────────────────────────────────────────────────────────────────────────────
# PDF 2: Three-Column Layout on Letter (column detection stress test)
# ─────────────────────────────────────────────────────────────────────────────

def generate_narrow_columns():
    """Generate a PDF with three narrow columns to stress column detection.
    Uses standard Letter size with realistic margins.
    """
    path = os.path.join(OUTPUT_DIR, "narrow-columns.pdf")
    c = canvas.Canvas(path, pagesize=letter)
    width, height = letter

    # Title
    c.setFont("Helvetica-Bold", 20)
    c.drawCentredString(width / 2, height - 50, "Three-Column Reference Sheet")

    # Three columns: x=54, x=234, x=414 (each ~180pt wide with 54pt margins/gutters)
    col_width = 160
    col_xs = [54, 240, 426]
    gap = col_xs[1] - (col_xs[0] + col_width)  # ~26pt gaps

    column_content = [
        [  # Column 1: JavaScript topics
            "JavaScript Basics",
            "Variables and Types",
            "Functions and Scope",
            "Arrays and Objects",
            "Loops and Conditionals",
            "Error Handling",
            "DOM Manipulation",
            "Event Handling",
        ],
        [  # Column 2: CSS topics
            "CSS Fundamentals",
            "Selectors and Specificity",
            "Box Model",
            "Flexbox Layout",
            "Grid Layout",
            "Responsive Design",
            "CSS Variables",
            "Animations",
        ],
        [  # Column 3: HTML topics
            "HTML Structure",
            "Semantic Elements",
            "Forms and Input",
            "Links and Navigation",
            "Images and Media",
            "Tables",
            "Meta Tags",
            "Accessibility",
        ],
    ]

    c.setFont("Helvetica", 10)
    y = height - 100
    for row_idx in range(8):
        for col_idx in range(3):
            x = col_xs[col_idx]
            text = column_content[col_idx][row_idx]
            c.drawString(x, y, text)
        y -= 20

    c.showPage()
    c.save()
    print(f"Generated: {path}")
    return path


# ─────────────────────────────────────────────────────────────────────────────
# PDF 3: Multiple Tables with Varying Structures on A4
# ─────────────────────────────────────────────────────────────────────────────

def generate_multi_table():
    """Generate a PDF with multiple tables: 2-col, 3-col, and 4-col.
    Tests table detection across different grid widths.
    """
    path = os.path.join(OUTPUT_DIR, "multi-table.pdf")

    doc = SimpleDocTemplate(path, pagesize=A4)
    styles = getSampleStyleSheet()
    
    h1 = ParagraphStyle("H1", parent=styles["Heading1"], fontSize=18, spaceAfter=12)
    h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=14, spaceAfter=8)
    body = ParagraphStyle("Body", parent=styles["Normal"], fontSize=10, spaceAfter=6)

    elements = []

    # Title
    elements.append(Paragraph("Data Reference Guide", h1))
    elements.append(Spacer(1, 12))

    # Section 1
    elements.append(Paragraph("HTTP Status Codes", h2))
    
    # 2-column table
    data_2col = [
        ["Code", "Description"],
        ["200", "OK — Request succeeded"],
        ["301", "Moved Permanently"],
        ["404", "Not Found"],
        ["500", "Internal Server Error"],
    ]
    t1 = Table(data_2col, colWidths=[60, 350])
    t1.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    elements.append(t1)
    elements.append(Spacer(1, 20))

    # Section 2
    elements.append(Paragraph("CSS Flexbox Properties", h2))

    # 3-column table
    data_3col = [
        ["Property", "Values", "Description"],
        ["display", "flex, inline-flex", "Defines a flex container"],
        ["flex-direction", "row, column", "Direction of main axis"],
        ["justify-content", "center, space-between", "Alignment on main axis"],
        ["align-items", "stretch, center, flex-start", "Alignment on cross axis"],
    ]
    t2 = Table(data_3col, colWidths=[120, 130, 200])
    t2.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    elements.append(t2)
    elements.append(Spacer(1, 20))

    # Section 3
    elements.append(Paragraph("Browser Compatibility Matrix", h2))

    # 4-column table
    data_4col = [
        ["Feature", "Chrome", "Firefox", "Safari"],
        ["CSS Grid", "57+", "52+", "10.1+"],
        ["Flexbox", "29+", "28+", "9+"],
        ["ES Modules", "61+", "60+", "11+"],
        ["Service Workers", "40+", "44+", "11.1+"],
    ]
    t3 = Table(data_4col, colWidths=[140, 100, 100, 100])
    t3.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    elements.append(t3)
    elements.append(Spacer(1, 20))

    # Some URL entities
    elements.append(Paragraph("Resources", h2))
    elements.append(Paragraph(
        'Check (https://caniuse.com) for feature support. See "https://developer.mozilla.org" for docs.',
        body
    ))
    elements.append(Paragraph(
        'Email webmaster@example.org for issues.',
        body
    ))

    doc.build(elements)
    print(f"Generated: {path}")
    return path


if __name__ == "__main__":
    generate_lecture_slides()
    generate_narrow_columns()
    generate_multi_table()
    print("\nAll test PDFs generated.")
