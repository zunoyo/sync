CREATE TABLE playlist
(
    id                BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id           BIGINT       NOT NULL,
    emotion_vector_id BIGINT       NOT NULL,
    title             VARCHAR(255) NOT NULL,
    primary_emotion   VARCHAR(50)  NOT NULL,
    created_at        DATETIME(6)  NOT NULL,
    INDEX idx_playlist_user_id (user_id),
    CONSTRAINT fk_playlist_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_playlist_emotion_vector FOREIGN KEY (emotion_vector_id) REFERENCES emotion_vector (id)
);

CREATE TABLE playlist_song
(
    id               BIGINT AUTO_INCREMENT PRIMARY KEY,
    playlist_id      BIGINT       NOT NULL,
    title            VARCHAR(255) NOT NULL,
    artist           VARCHAR(255),
    lastfm_tag       VARCHAR(100),
    spotify_track_id VARCHAR(255),
    preview_url      VARCHAR(500),
    album_image_url  VARCHAR(500),
    position         INT          NOT NULL,
    created_at       DATETIME(6)  NOT NULL,
    INDEX idx_playlist_song_playlist_id (playlist_id),
    CONSTRAINT fk_playlist_song_playlist FOREIGN KEY (playlist_id) REFERENCES playlist (id)
);
