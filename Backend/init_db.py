import sqlite3
import os
from werkzeug.security import generate_password_hash

DB_PATH = os.path.join(os.path.dirname(__file__), 'taskly.db')

def init_db():
    """Initializes the SQLite database and seeds it with demo data."""
    # Ensure the directory exists
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Create Users Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            password TEXT NOT NULL,
            globalRole TEXT DEFAULT 'student',
            isActive BOOLEAN DEFAULT 1,
            profilePicture TEXT,
            githubUsername TEXT
        )
    ''')

    # Create Groups Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS groups (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            inviteCode TEXT UNIQUE NOT NULL,
            leaderId TEXT,
            FOREIGN KEY (leaderId) REFERENCES users (id)
        )
    ''')

    # Create Group Members Table (Many-to-Many relationship)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS group_members (
            groupId TEXT,
            userId TEXT,
            role TEXT,
            PRIMARY KEY (groupId, userId),
            FOREIGN KEY (groupId) REFERENCES groups (id),
            FOREIGN KEY (userId) REFERENCES users (id)
        )
    ''')

    # Create Tasks Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            deadline TEXT,
            category TEXT,
            status TEXT DEFAULT 'pending',
            taskType TEXT DEFAULT 'group',
            isPersonal BOOLEAN DEFAULT 0,
            isArchived BOOLEAN DEFAULT 0,
            priority TEXT DEFAULT 'Medium',
            complexitySize TEXT DEFAULT 'M',
            githubBranch TEXT,
            actualLoC INTEGER,
            groupId TEXT,
            assignedTo TEXT,
            createdBy TEXT,
            progressNote TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (groupId) REFERENCES groups (id),
            FOREIGN KEY (assignedTo) REFERENCES users (id),
            FOREIGN KEY (createdBy) REFERENCES users (id)
        )
    ''')

    # Create Comments Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS comments (
            id TEXT PRIMARY KEY,
            taskId TEXT,
            userId TEXT,
            text TEXT NOT NULL,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            lastEditedAt DATETIME DEFAULT NULL,
            FOREIGN KEY (taskId) REFERENCES tasks (id) ON DELETE CASCADE,
            FOREIGN KEY (userId) REFERENCES users (id)
        )
    ''')

    # Create Progress Logs Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS progress_logs (
            id TEXT PRIMARY KEY,
            taskId TEXT,
            userId TEXT,
            note TEXT,
            statusAtLog TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (taskId) REFERENCES tasks (id),
            FOREIGN KEY (userId) REFERENCES users (id)
        )
    ''')

    conn.commit()
    conn.close()
    print(f"Database initialized successfully at: {DB_PATH}")

if __name__ == '__main__':
    init_db()