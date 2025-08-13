-- Custom SQL migration file, put your code below! --
CREATE OR REPLACE VIEW user_messages AS (
SELECT
        author,
        persona,
        (msg->>'createdAt')::timestamp AS date,
        msg->>'content' AS content,
        threads.id AS thread,
        array_length(regexp_split_to_array(msg->>'content', '\s+'), 1)::INTEGER AS word_count
    FROM threads,
        LATERAL jsonb_array_elements(messages) AS msg
    WHERE msg->>'role' = 'user'
    AND msg ? 'createdAt'
);
