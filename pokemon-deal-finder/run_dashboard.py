"""Open the dashboard at http://127.0.0.1:5000"""
from dealfinder.dashboard import app

if __name__ == "__main__":
    print("Dashboard running at http://127.0.0.1:5000  (Ctrl+C to stop)")
    app.run(host="127.0.0.1", port=5000, debug=False)
