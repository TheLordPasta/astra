CREATE TABLE opportunities (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    type VARCHAR(100),
    description TEXT,
    priority INTEGER,
    status VARCHAR(50) DEFAULT 'open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);