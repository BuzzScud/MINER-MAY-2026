# Budget Tracker V2

A comprehensive budget tracking web application built with Preline UI, Flask (Python), and IndexedDB for local storage.

## Features

- **Dashboard**: Overview of finances with charts and statistics
- **Budget Tracking**: Add, edit, and delete income/expense transactions
- **Categories**: Organize transactions by custom categories
- **Bill Reminders**: Set up reminders for upcoming bills with recurring options
- **Local Storage**: Up to 500MB of local storage using IndexedDB
- **Settings**: Manage categories, reminders, and storage

## Installation

1. **Install Python Dependencies**:
```bash
pip install -r requirements.txt
```

2. **Create Data Directory** (if it doesn't exist):
The application will automatically create a `data` directory for storing JSON files.

## Running the Application

1. **Start the Flask Server**:
```bash
python app.py
```

2. **Open in Browser**:
Navigate to `http://localhost:8000` (or open `index.html` directly)

Note: If opening `index.html` directly, you may need to start a local web server due to CORS restrictions:
```bash
python -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

## Project Structure

```
BUDGET TRACKER V2/
├── app.py              # Flask backend server
├── index.html          # Main HTML file with Preline UI
├── js/
│   ├── app.js          # Main application logic
│   └── storage.js      # IndexedDB storage management
├── data/               # JSON data storage (auto-created)
│   ├── budgets.json
│   ├── categories.json
│   └── reminders.json
└── requirements.txt    # Python dependencies
```

## API Endpoints

- `GET /api/budget` - Get all budget entries
- `POST /api/budget` - Create a new budget entry
- `PUT /api/budget/<id>` - Update a budget entry
- `DELETE /api/budget/<id>` - Delete a budget entry
- `GET /api/categories` - Get all categories
- `POST /api/categories` - Create a new category
- `GET /api/reminders` - Get all reminders
- `POST /api/reminders` - Create a new reminder
- `PUT /api/reminders/<id>` - Update a reminder
- `DELETE /api/reminders/<id>` - Delete a reminder
- `GET /api/dashboard/stats` - Get dashboard statistics

## Storage

The application uses IndexedDB for client-side storage, supporting up to 500MB of data. All transactions, categories, and reminders are stored locally in your browser.

## Technologies Used

- **Frontend**: HTML5, Preline UI (Tailwind CSS), JavaScript
- **Backend**: Flask (Python)
- **Storage**: IndexedDB
- **Charts**: Chart.js

## License

MIT

