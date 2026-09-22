CREATE TABLE competitors (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    website VARCHAR(255),
    instagram_username VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);