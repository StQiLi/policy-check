class AddPageUrlToPolicySnapshots < ActiveRecord::Migration[7.2]
  def change
    add_column :policy_snapshots, :page_url, :string
  end
end
