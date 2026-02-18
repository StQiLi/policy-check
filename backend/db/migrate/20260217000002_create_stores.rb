class CreateStores < ActiveRecord::Migration[7.2]
  def change
    create_table :stores do |t|
      t.string :domain, null: false
      t.string :name
      t.string :platform, null: false, default: 'shopify'
      
      t.timestamps
    end
    
    add_index :stores, :domain, unique: true
  end
end
