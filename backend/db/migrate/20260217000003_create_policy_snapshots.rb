class CreatePolicySnapshots < ActiveRecord::Migration[7.2]
  def change
    create_table :policy_snapshots do |t|
      t.references :store, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.string :policy_type, null: false
      t.string :policy_url, null: false
      t.text :raw_text_snippet
      t.jsonb :summary, default: {}
      t.datetime :extracted_at, null: false
      t.string :checksum, null: false
      
      t.timestamps
    end
    
    add_index :policy_snapshots, :checksum
    add_index :policy_snapshots, [:store_id, :checksum], unique: true
    add_index :policy_snapshots, [:store_id, :policy_type]
    add_index :policy_snapshots, :extracted_at
  end
end
