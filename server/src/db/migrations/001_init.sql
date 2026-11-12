-- CineVerse core schema (MySQL 8)

CREATE TABLE users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(30)  NOT NULL UNIQUE,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('user','admin') NOT NULL DEFAULT 'user',
  bio           VARCHAR(500) NULL,
  avatar_url    VARCHAR(500) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE refresh_tokens (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  token_hash  CHAR(64) NOT NULL UNIQUE,
  family_id   CHAR(36) NOT NULL,
  expires_at  DATETIME NOT NULL,
  revoked_at  DATETIME NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rt_family (family_id),
  CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE genres (
  id   SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE movies (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title         VARCHAR(255) NOT NULL,
  overview      TEXT NULL,
  director      VARCHAR(255) NULL,
  release_year  SMALLINT UNSIGNED NULL,
  runtime_min   SMALLINT UNSIGNED NULL,
  poster_url    VARCHAR(500) NULL,
  -- denormalised aggregates, maintained transactionally by the review service
  rating_sum    INT UNSIGNED NOT NULL DEFAULT 0,
  review_count  INT UNSIGNED NOT NULL DEFAULT 0,
  avg_rating    DECIMAL(4,2) GENERATED ALWAYS AS (IF(review_count = 0, 0, rating_sum / review_count)) STORED,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FULLTEXT INDEX ft_movies (title, overview, director),
  INDEX idx_movies_year (release_year),
  INDEX idx_movies_rating (avg_rating),
  INDEX idx_movies_popularity (review_count)
) ENGINE=InnoDB;

CREATE TABLE movie_genres (
  movie_id INT UNSIGNED NOT NULL,
  genre_id SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (movie_id, genre_id),
  INDEX idx_mg_genre (genre_id),
  CONSTRAINT fk_mg_movie FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  CONSTRAINT fk_mg_genre FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE reviews (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           INT UNSIGNED NOT NULL,
  movie_id          INT UNSIGNED NOT NULL,
  rating            TINYINT UNSIGNED NOT NULL,
  title             VARCHAR(150) NULL,
  body              TEXT NOT NULL,
  contains_spoilers BOOLEAN NOT NULL DEFAULT FALSE,
  sentiment_score   DECIMAL(4,3) NOT NULL DEFAULT 0,
  sentiment_label   ENUM('positive','neutral','negative') NOT NULL DEFAULT 'neutral',
  like_count        INT UNSIGNED NOT NULL DEFAULT 0,
  comment_count     INT UNSIGNED NOT NULL DEFAULT 0,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_review_user_movie (user_id, movie_id),
  INDEX idx_reviews_movie_created (movie_id, created_at, id),
  INDEX idx_reviews_created (created_at, id),
  CONSTRAINT chk_rating CHECK (rating BETWEEN 1 AND 10),
  CONSTRAINT fk_review_user  FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE,
  CONSTRAINT fk_review_movie FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE review_likes (
  user_id    INT UNSIGNED NOT NULL,
  review_id  INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, review_id),
  CONSTRAINT fk_like_user   FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE,
  CONSTRAINT fk_like_review FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE comments (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  review_id  INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  body       VARCHAR(1000) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_comments_review (review_id, created_at),
  CONSTRAINT fk_comment_review FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  CONSTRAINT fk_comment_user   FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE watchlist (
  user_id   INT UNSIGNED NOT NULL,
  movie_id  INT UNSIGNED NOT NULL,
  watched   BOOLEAN NOT NULL DEFAULT FALSE,
  added_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, movie_id),
  CONSTRAINT fk_wl_user  FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE,
  CONSTRAINT fk_wl_movie FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE follows (
  follower_id INT UNSIGNED NOT NULL,
  followee_id INT UNSIGNED NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (follower_id, followee_id),
  INDEX idx_follows_followee (followee_id),
  CONSTRAINT chk_no_self_follow CHECK (follower_id <> followee_id),
  CONSTRAINT fk_f_follower FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_f_followee FOREIGN KEY (followee_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Product analytics event stream (usage tracking for dashboards)
CREATE TABLE events (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NULL,
  type        VARCHAR(50) NOT NULL,
  entity_type VARCHAR(30) NULL,
  entity_id   INT UNSIGNED NULL,
  metadata    JSON NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_events_type_time (type, created_at),
  INDEX idx_events_time_user (created_at, user_id)
) ENGINE=InnoDB;
