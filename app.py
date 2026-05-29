import os
import json
import uuid
import csv
import io
import time
from flask import Flask, render_template, request, redirect, url_for, jsonify, session, send_file, flash
from flask_cors import CORS
from werkzeug.utils import secure_filename

from services.pdf_parser import parse_pdf
from services.categorizer import categorize_all, categorize
from services.analyzer import build_summary, savings_tips

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'dev-secret-change-in-prod')
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB per file
CORS(app)

DATA_DIR = os.path.join(os.path.dirname(__file__), 'uploads')
os.makedirs(DATA_DIR, exist_ok=True)


def _purge_stale_sessions(max_age_seconds: int = 86400):
    now = time.time()
    for fname in os.listdir(DATA_DIR):
        if not fname.endswith('.json'):
            continue
        fpath = os.path.join(DATA_DIR, fname)
        try:
            if now - os.path.getmtime(fpath) > max_age_seconds:
                os.remove(fpath)
        except OSError:
            pass


def _session_data_path() -> str:
    session_id = session.get('session_id')
    if not session_id:
        session_id = str(uuid.uuid4())
        session['session_id'] = session_id
    return os.path.join(DATA_DIR, f'{session_id}.json')


def _save_data(data: dict):
    with open(_session_data_path(), 'w') as f:
        json.dump(data, f)


def _load_data() -> dict | None:
    path = _session_data_path()
    if not os.path.exists(path):
        return None
    try:
        with open(path, 'r') as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/upload', methods=['POST'])
def upload():
    _purge_stale_sessions()
    files = request.files.getlist('pdfs')
    if not files or all(f.filename == '' for f in files):
        flash('No files selected.')
        return redirect(url_for('index'))

    all_transactions = []
    parse_errors = []
    files_processed = 0

    for file in files:
        if not file or file.filename == '':
            continue
        if not file.filename.lower().endswith('.pdf'):
            parse_errors.append(f'{file.filename}: not a PDF file')
            continue

        filename = secure_filename(file.filename)
        tmp_path = os.path.join(DATA_DIR, f'{uuid.uuid4()}_{filename}')
        try:
            file.save(tmp_path)
            txns = parse_pdf(tmp_path)
            categorize_all(txns)
            all_transactions.extend(txns)
            files_processed += 1
        except ValueError as e:
            if 'no_text' in str(e):
                parse_errors.append(
                    f'{file.filename}: No extractable text found. '
                    'Scanned PDF detected but OCR is unavailable — '
                    'install Tesseract and Poppler to enable automatic OCR.'
                )
            else:
                parse_errors.append(f'{file.filename}: {e}')
        except Exception as e:
            parse_errors.append(f'{file.filename}: {e}')
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    summary = build_summary(all_transactions)
    tips = savings_tips(summary)
    ocr_count = sum(1 for t in all_transactions if t.get('_ocr'))

    data = {
        'transactions': all_transactions,
        'summary': summary,
        'tips': tips,
        'parse_errors': parse_errors,
        'files_processed': files_processed,
        'transaction_count': len(all_transactions),
        'ocr_transaction_count': ocr_count,
    }
    _save_data(data)

    return redirect(url_for('dashboard'))


@app.route('/dashboard')
def dashboard():
    data = _load_data()
    if not data:
        return redirect(url_for('index'))
    return render_template('dashboard.html', stats={
        'files_processed': data.get('files_processed', 0),
        'transaction_count': data.get('transaction_count', 0),
        'parse_errors': data.get('parse_errors', []),
        'ocr_transaction_count': data.get('ocr_transaction_count', 0),
    })


@app.route('/api/data')
def api_data():
    data = _load_data()
    if not data:
        return jsonify({'error': 'No data. Upload statements first.'}), 404
    return jsonify(data)


@app.route('/api/export')
def api_export():
    data = _load_data()
    if not data:
        return jsonify({'error': 'No data'}), 404

    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=['date', 'description', 'amount', 'type', 'category'],
        extrasaction='ignore',
    )
    writer.writeheader()
    for txn in data.get('transactions', []):
        writer.writerow(txn)

    output.seek(0)
    return send_file(
        io.BytesIO(output.getvalue().encode('utf-8')),
        mimetype='text/csv',
        as_attachment=True,
        download_name='transactions.csv',
    )


@app.route('/api/update-category', methods=['POST'])
def update_category():
    data = _load_data()
    if not data:
        return jsonify({'error': 'No data'}), 404

    body = request.json or {}
    txn_date = body.get('date')
    txn_desc = body.get('description')
    txn_amount = body.get('amount')
    new_cat = body.get('category', '').strip()

    if not new_cat:
        return jsonify({'error': 'Missing category'}), 400

    updated = 0
    for txn in data['transactions']:
        if (txn.get('date') == txn_date
                and txn.get('description') == txn_desc
                and abs(txn.get('amount', 0) - float(txn_amount or 0)) < 0.01):
            txn['category'] = new_cat
            updated += 1

    if updated:
        data['summary'] = build_summary(data['transactions'])
        data['tips'] = savings_tips(data['summary'])
        _save_data(data)

    return jsonify({'ok': True, 'updated': updated})


@app.route('/api/recategorize', methods=['POST'])
def recategorize():
    data = _load_data()
    if not data:
        return jsonify({'error': 'No data'}), 404

    for txn in data['transactions']:
        txn['category'] = categorize(txn.get('description', ''))

    data['summary'] = build_summary(data['transactions'])
    data['tips'] = savings_tips(data['summary'])
    _save_data(data)
    return jsonify({'ok': True, 'count': len(data['transactions'])})


@app.route('/api/reset-session', methods=['POST'])
def reset_session():
    _purge_stale_sessions()
    path = _session_data_path()
    try:
        if os.path.exists(path):
            os.remove(path)
    except OSError:
        pass
    return jsonify({'ok': True})


@app.route('/api/parse-single', methods=['POST'])
def parse_single():
    file = request.files.get('pdf')
    if not file or not file.filename.lower().endswith('.pdf'):
        return jsonify({'ok': False, 'error': 'No valid PDF'}), 400

    filename = secure_filename(file.filename)
    tmp_path = os.path.join(DATA_DIR, f'{uuid.uuid4()}_{filename}')
    txns = []
    parse_error = None

    try:
        file.save(tmp_path)
        txns = parse_pdf(tmp_path)
        categorize_all(txns)
    except ValueError as e:
        if 'no_text' in str(e):
            parse_error = (
                f'{file.filename}: No extractable text. '
                'Scanned PDF — install Tesseract + Poppler to enable OCR.'
            )
        else:
            parse_error = f'{file.filename}: {e}'
    except Exception as e:
        parse_error = f'{file.filename}: {e}'
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    data = _load_data() or {
        'transactions': [], 'parse_errors': [],
        'files_processed': 0, 'transaction_count': 0,
        'ocr_transaction_count': 0,
    }

    if parse_error:
        data.setdefault('parse_errors', []).append(parse_error)
        _save_data(data)
        return jsonify({'ok': False, 'error': parse_error, 'filename': file.filename})

    # Merge + deduplicate across all previously-uploaded files
    all_txns = data.get('transactions', []) + txns
    seen = set()
    unique = []
    for t in all_txns:
        key = (t['date'], t['description'][:30], t['amount'])
        if key not in seen:
            seen.add(key)
            unique.append(t)

    data['transactions'] = unique
    data['files_processed'] = data.get('files_processed', 0) + 1
    data['transaction_count'] = len(unique)
    data['ocr_transaction_count'] = (
        data.get('ocr_transaction_count', 0) + sum(1 for t in txns if t.get('_ocr'))
    )
    summary = build_summary(unique)
    data['summary'] = summary
    data['tips'] = savings_tips(summary)
    _save_data(data)

    return jsonify({
        'ok': True,
        'filename': file.filename,
        'txn_count': len(txns),
        'total_txns': len(unique),
    })


if __name__ == '__main__':
    app.run(debug=True, port=5000)
