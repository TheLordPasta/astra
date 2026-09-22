CREATE TABLE trends (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(100),
    status VARCHAR(50),
    evidence TEXT,
    source VARCHAR(255),
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);