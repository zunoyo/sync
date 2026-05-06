CREATE TABLE emotion_vector
(
    id               BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id          BIGINT       NOT NULL,
    primary_emotion  VARCHAR(50)  NOT NULL,
    secondary_emotion VARCHAR(50) NOT NULL,
    emotion_scores   TEXT         NOT NULL,
    lastfm_tags      TEXT         NOT NULL,
    input_type       VARCHAR(10)  NULL,
    input_text       TEXT         NULL,
    created_at       DATETIME(6)  NOT NULL,
    INDEX idx_emotion_vector_user_id (user_id),
    CONSTRAINT fk_emotion_vector_user FOREIGN KEY (user_id) REFERENCES users (id)
);
