class RenameTypeColumnInMovies < ActiveRecord::Migration[8.0]
  def change
    rename_column :movies, :type, :media_type
  end
end
