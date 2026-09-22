CREATE TABLE designers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    brand_name VARCHAR(150),
    instagram_username VARCHAR(100),
    country VARCHAR(100),
    specialization VARCHAR(150),
    customer_id INTEGER REFERENCES customers(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);