# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.0].define(version: 2025_04_22_060000) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"
  enable_extension "pg_trgm"

  create_table "movies", force: :cascade do |t|
    t.integer "tmdb_id", null: false
    t.string "imdb_id"
    t.string "title"
    t.string "original_title"
    t.decimal "vote_average", precision: 3, scale: 1
    t.integer "vote_count"
    t.date "release_date"
    t.integer "runtime"
    t.string "backdrop_path"
    t.string "poster_path"
    t.text "overview"
    t.decimal "popularity", precision: 10, scale: 3
    t.string "tagline"
    t.text "genres"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "media_type", default: "movie", null: false
    t.integer "number_of_seasons"
    t.integer "number_of_episodes"
    t.index ["imdb_id"], name: "index_movies_on_imdb_id"
    t.index ["popularity"], name: "index_movies_on_popularity"
    t.index ["release_date"], name: "index_movies_on_release_date"
    t.index ["title"], name: "index_movies_on_title_gist_trgm", opclass: :gist_trgm_ops, using: :gist
    t.index ["tmdb_id", "media_type"], name: "index_movies_on_tmdb_id_and_media_type", unique: true
    t.index ["tmdb_id"], name: "index_movies_on_tmdb_id"
    t.index ["vote_average"], name: "index_movies_on_vote_average"
  end
end
