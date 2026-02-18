class CreateFeedbacks < ActiveRecord::Migration[7.2]
  def change
    create_table :feedbacks do |t|
      t.references :policy_snapshot, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.string :field_name, null: false
      t.string :correction, null: false
      t.text :comment
      
      t.timestamps
    end
    
    add_index :feedbacks, :field_name
    add_index :feedbacks, :created_at
  end
end
