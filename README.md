# Finance Tracker

Personal finance tracker — upload bank statement PDFs, get instant spending analysis.

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

## Test the parser

```bash
python test_parser.py path/to/statement.pdf
```

## Supported formats

- Chase credit card statements
- Citi statements
- Bank of America statements
- Most other bank PDFs with date + description + amount layout

## Notes

- Scanned/image PDFs are not supported — run OCR first (e.g. Adobe Acrobat, Google Drive)
- Files are processed in memory and deleted after parsing — never stored permanently
- Session data saved as JSON in `uploads/` directory
