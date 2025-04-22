class RemoveIndexMoviesOnTitle < ActiveRecord::Migration[8.0]
  def change
    remove_index :movies, name: "index_movies_on_title"
  end
end
