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

ActiveRecord::Schema[7.2].define(version: 2026_02_17_000004) do
  create_table "feedbacks", force: :cascade do |t|
    t.integer "policy_snapshot_id", null: false
    t.integer "user_id", null: false
    t.string "field_name", null: false
    t.string "correction", null: false
    t.text "comment"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["created_at"], name: "index_feedbacks_on_created_at"
    t.index ["field_name"], name: "index_feedbacks_on_field_name"
    t.index ["policy_snapshot_id"], name: "index_feedbacks_on_policy_snapshot_id"
    t.index ["user_id"], name: "index_feedbacks_on_user_id"
  end

  create_table "policy_snapshots", force: :cascade do |t|
    t.integer "store_id", null: false
    t.integer "user_id", null: false
    t.string "policy_type", null: false
    t.string "policy_url", null: false
    t.text "raw_text_snippet"
    t.json "summary", default: {}
    t.datetime "extracted_at", null: false
    t.string "checksum", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["checksum"], name: "index_policy_snapshots_on_checksum"
    t.index ["extracted_at"], name: "index_policy_snapshots_on_extracted_at"
    t.index ["store_id", "checksum"], name: "index_policy_snapshots_on_store_id_and_checksum", unique: true
    t.index ["store_id", "policy_type"], name: "index_policy_snapshots_on_store_id_and_policy_type"
    t.index ["store_id"], name: "index_policy_snapshots_on_store_id"
    t.index ["user_id"], name: "index_policy_snapshots_on_user_id"
  end

  create_table "stores", force: :cascade do |t|
    t.string "domain", null: false
    t.string "name"
    t.string "platform", default: "shopify", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["domain"], name: "index_stores_on_domain", unique: true
  end

  create_table "users", force: :cascade do |t|
    t.string "email", null: false
    t.string "auth_token", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["auth_token"], name: "index_users_on_auth_token", unique: true
    t.index ["email"], name: "index_users_on_email", unique: true
  end

  add_foreign_key "feedbacks", "policy_snapshots"
  add_foreign_key "feedbacks", "users"
  add_foreign_key "policy_snapshots", "stores"
  add_foreign_key "policy_snapshots", "users"
end
