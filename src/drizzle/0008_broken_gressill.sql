-- Custom SQL migration file, put your code below! --
CREATE OR REPLACE VIEW user_messages AS (
    SELECT
        author,
        persona,
        (msg->>'createdAt')::timestamp AS date
    FROM threads,
        LATERAL jsonb_array_elements(messages) AS msg
    WHERE msg->>'role' = 'user'
    AND msg ? 'createdAt'
);
