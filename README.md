# Finance Tracker

![Python 3.8+](https://img.shields.io/badge/Python-3.8+-blue) ![Flask](https://img.shields.io/badge/Flask-2.x-green) ![License: MIT](https://img.shields.io/badge/License-MIT-yellow)

Upload bank statement PDFs and get instant spending analysis — auto-categorized across 13 categories, with charts, merchant rankings, savings tips, and CSV/PDF export. Supports both native text PDFs and scanned PDFs via OCR.

## Contents

- [Requirements](#requirements)
- [Setup](#setup)
- [OCR Support (scanned PDFs)](#ocr-support-scanned-pdfs)
- [Features](#features)
- [Supported Bank Formats](#supported-bank-formats)
- [Spending Categories](#spending-categories)
- [Customizing Categories](#customizing-categories)
- [Export Details](#export-details)
- [Data Privacy](#data-privacy)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

---

## Requirements

- **Python 3.8+**
- **pip** (comes with Python)
- Optional: Tesseract OCR + Poppler (for scanned/image PDFs — see [OCR Support](#ocr-support-scanned-pdfs))

---

## Setup

```bash
# 1. Create virtual environment
python -m venv venv

# 2. Activate it
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

# 3. Install Python dependencies
pip install -r requirements.txt

# 4. Run the app
python app.py
```

Open [http://localhost:5000](http://localhost:5000) in your browser.

- Server runs in **debug mode** — auto-reloads on file changes.
- Default port is **5000**. If taken, change `port=5000` in `app.py` to any free port (e.g. `5001`).
- Stop the server with **Ctrl+C**.

---

## OCR Support (scanned PDFs)

Native text PDFs work out of the box. For scanned/image-based PDFs, install two binaries:

**1. Tesseract OCR**
- Download installer: https://github.com/UB-Mannheim/tesseract/wiki
- Install to default path: `C:\Program Files\Tesseract-OCR\`
- Custom install path? Set env var: `TESSERACT_CMD=C:\your\path\tesseract.exe`

**2. Poppler** (required by pdf2image to render PDF pages as images)
- Download: https://github.com/oschwartz10612/poppler-windows/releases
- Extract and set env var: `POPPLER_PATH=C:\your\path\poppler\bin`

The app auto-detects scanned PDFs and falls back to OCR if Tesseract is available. Transactions extracted via OCR are tagged with a "🔍 N via OCR" badge in the dashboard.

---

## Features

- **Multi-file upload** — drag and drop multiple PDFs at once
- **Auto-categorization** — 13 spending categories with keyword matching
- **OCR fallback** — scanned/image PDFs parsed automatically (requires Tesseract + Poppler)
- **Charts** — doughnut (by category) and bar (by month) via Chart.js
- **Transactions table** — search, filter by category/type, sort, paginated
- **Top merchants** — ranked by total spend with visit counts
- **Savings tips** — personalized tips based on your spending patterns
- **CSV export** — download all transactions with date, description, amount, type, category columns
- **PDF report** — click "Download PDF" to print/save the full dashboard as a formatted PDF

---

## Supported Bank Formats

| Bank | Format handled |
|------|----------------|
| Chase | `MM/DD DESCRIPTION AMOUNT` |
| Citi | `MM/DD/YY DESCRIPTION AMOUNT` |
| Bank of America | Single-date and two-date (`MM/DD/YY MM/DD/YY`) layouts |
| Discover | Two-date columns (`MM/DD MM/DD DESCRIPTION AMOUNT`), `CR` credits |
| Zolve | ISO date (`YYYY-MM-DD DESCRIPTION AMOUNT`) |
| Generic | Any PDF with date + description + amount on one line |

Credits marked with `CR` suffix (Discover, BoA) are automatically classified as income.

If your bank's format produces incorrect results, modify `data/categories.json` to add matching keywords, or open an issue with a redacted sample PDF so the parser can be extended.

---

## Spending Categories

| Category | What it catches |
|---|---|
| Dining Out | Restaurants, delivery apps, fast food, cafes |
| Groceries | Supermarkets, grocery chains (Whole Foods, Kroger, etc.) |
| Transport | Uber/Lyft, gas stations, parking, auto service |
| Shopping | Amazon, Target, clothing, electronics, home goods |
| Entertainment | Streaming, cinemas, concerts, gaming |
| Subscriptions | SaaS tools, cloud storage, productivity apps |
| Utilities | Phone, internet, electric, water, cable |
| Health | Pharmacy, doctors, dentists, insurance |
| Travel | Airlines, hotels, Airbnb, rental cars |
| Rent & Housing | Rent, mortgage, HOA, home repair |
| Fitness | Gyms, classes, athletic gear |
| Education | Courses, tuition, textbooks |
| Other | Anything unmatched |

---

## Customizing Categories

Categories are driven by `data/categories.json`. The format is:

```json
{
  "Dining Out": [
    "starbucks", "chipotle", "doordash", "restaurant", "cafe"
  ],
  "Groceries": [
    "whole foods", "trader joe", "kroger", "walmart"
  ]
}
```

Each key is a category name; the value is a list of lowercase keywords. A transaction description is matched against these keywords (case-insensitive substring match). **The file reloads automatically** — no server restart needed.

To add a new category:
1. Add a new key + keyword list to `data/categories.json`
2. Add a color for it in `static/js/dashboard.js` in the `CAT_COLORS` object

---

## Export Details

**CSV export** (`/api/export`)
- Columns: `date`, `description`, `amount`, `type`, `category`
- Filename: `transactions.csv`
- Includes all transactions from the current session

**PDF report** (browser print)
- Click "Download PDF" in the sidebar
- Triggers browser print dialog — choose "Save as PDF"
- Prints the full dashboard: summary cards, charts, top merchants, savings tips, and transactions table
- Uses a light print theme (white background, dark text) for readability

---

## Data Privacy

- Uploaded PDFs are **deleted immediately** after parsing — never stored permanently.
- Session data (transaction JSON) is saved to `uploads/<session-id>.json` — one file per browser session.
- Sessions are **auto-purged after 24 hours** on the next upload.
- To manually clear session data: delete all `.json` files in the `uploads/` folder.
- **No data is sent to external servers.** Everything runs locally.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `ModuleNotFoundError: No module named 'flask'` | Activate venv, then run `pip install -r requirements.txt` |
| `Tesseract not found` / OCR fails | Set `TESSERACT_CMD` env var or reinstall from the link above |
| Port 5000 already in use | Change `port=5000` to `port=5001` in `app.py`, or kill the process on 5000 |
| PDF upload hangs | Large PDFs (100+ pages) may time out — test with smaller files first |
| Transactions miscategorized | Add matching keywords to `data/categories.json` — reloads automatically |
| Wrong amounts / dates parsed | Bank format may not match parser patterns — open an issue with a sample |

---

## Development

**Test the parser on a single file:**

```bash
python test_parser.py path/to/statement.pdf
```

**Add a new spending category:**
1. Add the category + keywords to `data/categories.json`
2. Add a color entry in `static/js/dashboard.js` → `CAT_COLORS`

**Known limitations:**
- Multi-currency transactions may parse incorrectly (amounts assumed USD)
- Handwritten annotations on scanned PDFs are ignored
- Very dense PDFs (100+ pages) may be slow to process

---

## Notes

- Uploaded PDFs deleted immediately after parsing — never stored permanently
- Session data (JSON) stored in `uploads/` — auto-purged after 24 hours
- Categories reload automatically when `data/categories.json` is modified
