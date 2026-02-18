from flask import Flask, request, jsonify, send_from_directory, send_file
from flask_cors import CORS
from datetime import datetime, timedelta
import json
import os

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

# Serve static files (JS, CSS, etc.)
@app.route('/js/<path:filename>')
def serve_js(filename):
    return send_from_directory('js', filename)

# Data storage directory
DATA_DIR = 'data'
if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR)

# File upload directory
UPLOAD_DIR = 'uploads'
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

ALLOWED_EXTENSIONS = {'png'}
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def load_data(filename):
    """Load data from JSON file"""
    filepath = os.path.join(DATA_DIR, filename)
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            return json.load(f)
    return []

def save_data(filename, data):
    """Save data to JSON file"""
    filepath = os.path.join(DATA_DIR, filename)
    with open(filepath, 'w') as f:
        json.dump(data, f, indent=2)

# Budget API Routes
@app.route('/api/budget', methods=['GET'])
def get_budgets():
    """Get all budget entries"""
    return jsonify(load_data('budgets.json'))

@app.route('/api/budget', methods=['POST'])
def create_budget():
    """Create a new budget entry"""
    data = request.json
    budgets = load_data('budgets.json')
    
    entry = {
        'id': len(budgets) + 1,
        'amount': data.get('amount', 0),
        'category': data.get('category', 'Uncategorized'),
        'type': data.get('type', 'expense'),  # 'income' or 'expense'
        'description': data.get('description', ''),
        'date': data.get('date', datetime.now().isoformat()),
        'created_at': datetime.now().isoformat()
    }
    
    budgets.append(entry)
    save_data('budgets.json', budgets)
    return jsonify(entry), 201

@app.route('/api/budget/<int:budget_id>', methods=['PUT'])
def update_budget(budget_id):
    """Update a budget entry"""
    data = request.json
    budgets = load_data('budgets.json')
    
    for i, budget in enumerate(budgets):
        if budget.get('id') == budget_id:
            budgets[i].update({
                'amount': data.get('amount', budget.get('amount')),
                'category': data.get('category', budget.get('category')),
                'type': data.get('type', budget.get('type')),
                'description': data.get('description', budget.get('description')),
                'date': data.get('date', budget.get('date'))
            })
            save_data('budgets.json', budgets)
            return jsonify(budgets[i])
    
    return jsonify({'error': 'Budget entry not found'}), 404

@app.route('/api/budget/<int:budget_id>', methods=['DELETE'])
def delete_budget(budget_id):
    """Delete a budget entry"""
    budgets = load_data('budgets.json')
    budgets = [b for b in budgets if b.get('id') != budget_id]
    save_data('budgets.json', budgets)
    return jsonify({'message': 'Budget entry deleted'}), 200

# Categories API Routes
@app.route('/api/categories', methods=['GET'])
def get_categories():
    """Get all categories"""
    categories = load_data('categories.json')
    if not categories:
        # Default categories
        default_categories = [
            {'id': 1, 'name': 'Food & Dining', 'color': '#3b82f6'},
            {'id': 2, 'name': 'Transportation', 'color': '#ef4444'},
            {'id': 3, 'name': 'Shopping', 'color': '#10b981'},
            {'id': 4, 'name': 'Bills & Utilities', 'color': '#f59e0b'},
            {'id': 5, 'name': 'Entertainment', 'color': '#8b5cf6'},
            {'id': 6, 'name': 'Healthcare', 'color': '#ec4899'},
            {'id': 7, 'name': 'Housing', 'color': '#6366f1'},
            {'id': 8, 'name': 'Salary', 'color': '#14b8a6'},
            {'id': 9, 'name': 'Investment', 'color': '#06b6d4'}
        ]
        save_data('categories.json', default_categories)
        return jsonify(default_categories)
    return jsonify(categories)

@app.route('/api/categories', methods=['POST'])
def create_category():
    """Create a new category"""
    data = request.json
    categories = load_data('categories.json')
    
    category = {
        'id': len(categories) + 1,
        'name': data.get('name', 'New Category'),
        'color': data.get('color', '#6b7280')
    }
    
    categories.append(category)
    save_data('categories.json', categories)
    return jsonify(category), 201

# Reminders API Routes
@app.route('/api/reminders', methods=['GET'])
def get_reminders():
    """Get all reminders"""
    return jsonify(load_data('reminders.json'))

@app.route('/api/reminders', methods=['POST'])
def create_reminder():
    """Create a new reminder"""
    data = request.json
    reminders = load_data('reminders.json')
    
    reminder = {
        'id': len(reminders) + 1,
        'title': data.get('title', ''),
        'amount': data.get('amount', 0),
        'due_date': data.get('due_date', ''),
        'category': data.get('category', 'Bills & Utilities'),
        'website_url': data.get('website_url', ''),
        'recurring': data.get('recurring', False),
        'recurrence_type': data.get('recurrence_type', 'monthly'),  # daily, weekly, monthly, yearly
        'is_paid': False,
        'created_at': datetime.now().isoformat()
    }
    
    reminders.append(reminder)
    save_data('reminders.json', reminders)
    return jsonify(reminder), 201

@app.route('/api/reminders/<int:reminder_id>', methods=['PUT'])
def update_reminder(reminder_id):
    """Update a reminder"""
    data = request.json
    reminders = load_data('reminders.json')
    
    for i, reminder in enumerate(reminders):
        if reminder.get('id') == reminder_id:
            reminders[i].update({
                'title': data.get('title', reminder.get('title')),
                'amount': data.get('amount', reminder.get('amount')),
                'due_date': data.get('due_date', reminder.get('due_date')),
                'category': data.get('category', reminder.get('category')),
                'website_url': data.get('website_url', reminder.get('website_url', '')),
                'recurring': data.get('recurring', reminder.get('recurring')),
                'recurrence_type': data.get('recurrence_type', reminder.get('recurrence_type')),
                'is_paid': data.get('is_paid', reminder.get('is_paid'))
            })
            save_data('reminders.json', reminders)
            return jsonify(reminders[i])
    
    return jsonify({'error': 'Reminder not found'}), 404

@app.route('/api/reminders/<int:reminder_id>', methods=['DELETE'])
def delete_reminder(reminder_id):
    """Delete a reminder"""
    reminders = load_data('reminders.json')
    reminders = [r for r in reminders if r.get('id') != reminder_id]
    save_data('reminders.json', reminders)
    return jsonify({'message': 'Reminder deleted'}), 200

@app.route('/api/reminders/<int:reminder_id>/upload', methods=['POST'])
def upload_reminder_attachment(reminder_id):
    """Upload attachment file for a reminder"""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({'error': 'Only PNG files are allowed'}), 400
    
    reminders = load_data('reminders.json')
    reminder = next((r for r in reminders if r.get('id') == reminder_id), None)
    
    if not reminder:
        return jsonify({'error': 'Reminder not found'}), 404
    
    # Save file
    filename = secure_filename(f'reminder_{reminder_id}_{file.filename}')
    filepath = os.path.join(UPLOAD_DIR, filename)
    file.save(filepath)
    
    # Update reminder with attachment URL
    for i, r in enumerate(reminders):
        if r.get('id') == reminder_id:
            reminders[i]['attachment_url'] = f'/uploads/{filename}'
            save_data('reminders.json', reminders)
            break
    
    return jsonify({
        'message': 'File uploaded successfully',
        'attachment_url': f'/uploads/{filename}'
    }), 200

@app.route('/uploads/<path:filename>')
def serve_upload(filename):
    """Serve uploaded files"""
    return send_from_directory(UPLOAD_DIR, filename)

# Dashboard Statistics
@app.route('/api/dashboard/stats', methods=['GET'])
def get_dashboard_stats():
    """Get dashboard statistics"""
    budgets = load_data('budgets.json')
    
    total_income = sum(b.get('amount', 0) for b in budgets if b.get('type') == 'income')
    total_expenses = sum(b.get('amount', 0) for b in budgets if b.get('type') == 'expense')
    balance = total_income - total_expenses
    
    # Current month stats
    now = datetime.now()
    current_month = [b for b in budgets if datetime.fromisoformat(b.get('date', now.isoformat())).month == now.month]
    month_income = sum(b.get('amount', 0) for b in current_month if b.get('type') == 'income')
    month_expenses = sum(b.get('amount', 0) for b in current_month if b.get('type') == 'expense')
    
    # Add bills/reminders to monthly expenses (both paid and unpaid for current month)
    reminders = load_data('reminders.json')
    for reminder in reminders:
        if reminder.get('due_date'):
            try:
                due_date = datetime.fromisoformat(reminder['due_date'])
                # Include reminders due in the current month
                if due_date.month == now.month and due_date.year == now.year:
                    month_expenses += reminder.get('amount', 0)
            except (ValueError, TypeError):
                # Skip invalid dates
                pass
    
    # Category breakdown - include both budgets and bills (reminders)
    category_expenses = {}
    
    # Add expenses from budgets
    for budget in budgets:
        if budget.get('type') == 'expense':
            cat = budget.get('category', 'Uncategorized')
            category_expenses[cat] = category_expenses.get(cat, 0) + budget.get('amount', 0)
    
    # Add expenses from bills/reminders (paid and unpaid) - reminders already loaded above
    for reminder in reminders:
        cat = reminder.get('category', 'Bills & Utilities')
        amount = reminder.get('amount', 0)
        if amount > 0:
            category_expenses[cat] = category_expenses.get(cat, 0) + amount
    
    # Get upcoming reminders (already loaded above)
    upcoming_reminders = []
    for reminder in reminders:
        if not reminder.get('is_paid', False) and reminder.get('due_date'):
            try:
                due_date = datetime.fromisoformat(reminder['due_date'])
                # Include reminders that are due today or in the future
                if due_date.date() >= datetime.now().date():
                    upcoming_reminders.append(reminder)
            except (ValueError, TypeError):
                # Skip invalid dates
                pass
    
    upcoming_reminders.sort(key=lambda x: x.get('due_date', ''))
    
    # Calculate expense trends (last 7 days)
    now = datetime.now()
    expense_trends = []
    for i in range(6, -1, -1):
        date = (now - timedelta(days=i)).date()
        day_expenses = 0
        
        # Expenses from budgets
        for budget in budgets:
            if budget.get('type') == 'expense':
                budget_date = datetime.fromisoformat(budget.get('date', now.isoformat())).date()
                if budget_date == date:
                    day_expenses += budget.get('amount', 0)
        
        # Expenses from paid reminders
        for reminder in reminders:
            if reminder.get('is_paid', False):
                reminder_date = datetime.fromisoformat(reminder.get('due_date', now.isoformat())).date()
                if reminder_date == date:
                    day_expenses += reminder.get('amount', 0)
        
        expense_trends.append({
            'date': date.isoformat(),
            'amount': day_expenses
        })
    
    return jsonify({
        'total_income': total_income,
        'total_expenses': total_expenses,
        'balance': balance,
        'month_income': month_income,
        'month_expenses': month_expenses,
        'category_expenses': category_expenses,
        'upcoming_reminders': upcoming_reminders[:5],
        'expense_trends': expense_trends
    })

@app.route('/')
def index():
    """Serve the main HTML file"""
    return send_from_directory('.', 'index.html')

if __name__ == '__main__':
    app.run(debug=True, port=8000, host='0.0.0.0')

