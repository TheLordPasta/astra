CREATE TABLE conversations (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id),
    platform VARCHAR(50),
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'open'
);