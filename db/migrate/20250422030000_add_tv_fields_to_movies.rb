class AddTvFieldsToMovies < ActiveRecord::Migration[8.0]
  def change
    add_column :movies, :number_of_seasons, :integer
    add_column :movies, :number_of_episodes, :integer
  end
end
