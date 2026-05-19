# Finance Tracker

Personal finance tracker — upload bank statement PDFs, get instant spending analysis, charts, and savings tips.

## Setup

```bash
# 1. Create virtual environment
python -m venv venv

# 2. Activate it
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run the app
python app.py

# 5. Open browser
# http://localhost:5000
```

## OCR Support (scanned PDFs)

Native text PDFs work out of the box. For scanned/image PDFs, install two binaries:

**1. Tesseract OCR**
- Download installer: https://github.com/UB-Mannheim/tesseract/wiki
- Install to default path: `C:\Program Files\Tesseract-OCR\`
- Custom path: set env var `TESSERACT_CMD=C:\your\path\tesseract.exe`

**2. Poppler** (required by pdf2image)
- Download: https://github.com/oschwartz10612/poppler-windows/releases
- Extract and set env var: `POPPLER_PATH=C:\your\path\poppler\bin`

The app auto-detects scanned PDFs and falls back to OCR if Tesseract is available. Transactions extracted via OCR are tagged in the dashboard.

## Test the parser

```bash
python test_parser.py path/to/statement.pdf
```

## Supported bank formats

- Chase credit card statements
- Citi statements
- Bank of America statements
- Most bank PDFs with date + description + amount layout

## Features

- **Multi-file upload** — drag and drop multiple PDFs at once
- **Auto-categorization** — 13 spending categories with keyword matching
- **Charts** — doughnut (by category) and bar (by month) via Chart.js
- **Transactions table** — search, filter by category/type, sort, paginated
- **Top merchants** — ranked by total spend with visit counts
- **Savings tips** — personalized tips based on your spending patterns
- **CSV export** — download all transactions
- **PDF report** — click "Download PDF" in the sidebar to print/save the full dashboard

## Spending categories

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

## Notes

- Uploaded PDFs deleted immediately after parsing — never stored permanently
- Session data (JSON) stored in `uploads/` — auto-purged after 24 hours
- Categories reload automatically when `data/categories.json` is modified
