require 'csv'
require 'open-uri'
require 'fileutils'
require 'net/http'

namespace :tmdb do
  desc 'Download and import TMDB movies and TV shows datasets'
  task :import => :environment do
    # Configuration
    batch_size = ENV.fetch('BATCH_SIZE', 5000).to_i
    movie_csv_path = Rails.root.join('tmp', 'TMDB_movie_dataset_v11.csv')
    tv_csv_path = Rails.root.join('tmp', 'TMDB_tv_dataset_v3.csv')
    movie_kaggle_url = ENV.fetch('MOVIE_KAGGLE_URL', 'https://www.kaggle.com/api/v1/datasets/download/asaniczka/tmdb-movies-dataset-2023-930k-movies')
    tv_kaggle_url = ENV.fetch('TV_KAGGLE_URL', 'https://www.kaggle.com/api/v1/datasets/download/asaniczka/full-tmdb-tv-shows-dataset-2023-150k-shows')

    # Download and extract movies
    download_and_extract(movie_kaggle_url, movie_csv_path, 'movies.zip')
    activerecord_batch_import(movie_csv_path, batch_size, 'movie')

    # Download and extract TV shows
    download_and_extract(tv_kaggle_url, tv_csv_path, 'tv')
    activerecord_batch_import(tv_csv_path, batch_size, 'tv')

    puts "TMDB import completed!"
  end

  desc 'Download and overlay IMDb data on existing movies'
  task :overlay_imdb => :environment do
    # Configuration
    batch_size = ENV.fetch('BATCH_SIZE', 5000).to_i
    imdb_csv_path = Rails.root.join('tmp', 'imdb_data.csv')
    imdb_kaggle_url = ENV.fetch('IMDB_KAGGLE_URL', 'https://www.kaggle.com/api/v1/datasets/download/octopusteam/full-imdb-dataset')

    # Download and extract IMDb data
    download_and_extract(imdb_kaggle_url, imdb_csv_path, 'imdb.zip', 'data.csv')
    overlay_imdb_data_in_memory(imdb_csv_path)

    puts "IMDb data overlay completed!"
  end

  desc 'Remove all indexes except unique constraint to speed up bulk imports'
  task :remove_indexes => :environment do
    puts "Removing indexes from movies table to speed up bulk operations..."

    ActiveRecord::Base.connection.execute(<<-SQL)
      DROP INDEX IF EXISTS index_movies_on_imdb_id;
      DROP INDEX IF EXISTS index_movies_on_popularity;
      DROP INDEX IF EXISTS index_movies_on_release_date;
      DROP INDEX IF EXISTS index_movies_on_title_gist_trgm;
      DROP INDEX IF EXISTS index_movies_on_tmdb_id;
      DROP INDEX IF EXISTS index_movies_on_vote_average;
    SQL

    puts "Indexes removed. Only unique constraint remains."
  end

  desc 'Restore all indexes after bulk import operations'
  task :restore_indexes => :environment do
    puts "Restoring indexes to movies table..."

    ActiveRecord::Base.connection.execute(<<-SQL)
      CREATE INDEX IF NOT EXISTS index_movies_on_imdb_id ON movies (imdb_id);
      CREATE INDEX IF NOT EXISTS index_movies_on_popularity ON movies (popularity);
      CREATE INDEX IF NOT EXISTS index_movies_on_release_date ON movies (release_date);
      CREATE INDEX IF NOT EXISTS index_movies_on_title_gist_trgm ON movies USING gist (title gist_trgm_ops);
      CREATE INDEX IF NOT EXISTS index_movies_on_tmdb_id ON movies (tmdb_id);
      CREATE INDEX IF NOT EXISTS index_movies_on_vote_average ON movies (vote_average);
    SQL

    puts "Indexes restored."
  end

  private

  def download_and_extract(kaggle_url, csv_path, zip_name, extract_filename = nil)
    download_path = Rails.root.join('tmp', zip_name)

    # Download dataset
    if File.exist?(download_path) && !ENV['FORCE_DOWNLOAD']
      puts "#{zip_name} already exists at #{download_path}. Skipping download."
    else
      puts "Downloading #{zip_name}..."
      download_with_progress(kaggle_url, download_path)
    end

    # Extract CSV
    if File.exist?(csv_path) && !ENV['FORCE_EXTRACT']
      puts "CSV file already exists at #{csv_path}. Skipping extraction."
    else
      puts "Extracting #{zip_name}..."
      if extract_filename
        # Extract specific file and rename
        system("unzip -j #{download_path} #{extract_filename} -d #{Rails.root.join('tmp')}")
        FileUtils.mv(Rails.root.join('tmp', extract_filename), csv_path) if extract_filename != File.basename(csv_path)
      else
        system("unzip -j #{download_path} -d #{Rails.root.join('tmp')}")
      end
    end
  end

  def activerecord_batch_import(csv_path, batch_size, media_type)
    puts "Importing #{media_type}s from #{csv_path} (batch size: #{batch_size})..."

    movies_batch = []
    total_imported = 0
    CSV.foreach(csv_path, headers: true) do |row|
      begin
        # Skip rows without a valid ID
        next if row['id'].blank?

        # Map fields
        movie = {
          tmdb_id: row['id'].to_i,
          title: media_type == 'tv' ? row['name'] : row['title'],
          original_title: media_type == 'tv' ? row['original_name'] : row['original_title'],
          vote_average: row['vote_average'].to_f,
          vote_count: row['vote_count'].to_i,
          overview: row['overview'],
          tagline: row['tagline'],
          backdrop_path: row['backdrop_path'],
          poster_path: row['poster_path'],
          genres: row['genres'],
          popularity: row['popularity'].to_f,
          runtime: media_type == 'tv' ? row['episode_run_time'].to_i : row['runtime'].to_i,
          number_of_seasons: media_type == 'tv' ? row['number_of_seasons'].to_i : nil,
          number_of_episodes: media_type == 'tv' ? row['number_of_episodes'].to_i : nil,
          media_type: media_type
        }

        movies_batch << Movie.new(movie)

        # Process batch
        if movies_batch.size >= batch_size
          import_batch(movies_batch)
          total_imported += movies_batch.size
          print "\rTotal #{media_type}s imported so far: #{total_imported}"
          movies_batch = []
        end
      rescue => e
        puts "Error processing row: #{e.message}"
      end
    end

    # Import remaining movies
    unless movies_batch.empty?
      import_batch(movies_batch)
      total_imported += movies_batch.size
      print "\rTotal #{media_type}s imported so far: #{total_imported}"
    end
  end

  def import_batch(movies_batch)
    movies_batch.uniq! { |movie| [movie.tmdb_id, movie.media_type] }
    Movie.import movies_batch, on_duplicate_key_update: {
      conflict_target: [:tmdb_id, :media_type],
      columns: [:title, :original_title, :vote_average, :vote_count, :overview,
                :tagline, :backdrop_path, :poster_path, :genres, :popularity,
                :runtime, :number_of_seasons, :number_of_episodes, :updated_at]
    }
  end

  def overlay_imdb_data_in_memory(imdb_csv_path)
    puts "Loading IMDb data from #{imdb_csv_path}..."

    # Parse IMDb data into a lookup structure
    imdb_by_id = {}
    imdb_by_title = {}
    imdb_by_title_year = {}

    total_imdb_records = 0

    # First pass: Load all IMDb data into memory
    CSV.foreach(imdb_csv_path, headers: true) do |row|
      begin
        # Skip rows without valid ID or title
        next if row['id'].blank? || row['title'].blank?

        imdb_id = row['id']
        title = row['title']
        release_year = row['releaseYear'].to_i
        average_rating = row['averageRating'].to_f
        num_votes = row['numVotes'].to_i
        media_type = row['type']

        # Map IMDb type to our media_type format
        normalized_type = case media_type
                          when 'movie'
                            'movie'
                          when 'tvSeries', 'tvMiniSeries'
                            'tv'
                          else
                            nil
                          end

        # Skip if no valid type mapping or no rating/votes
        next if normalized_type.nil? || average_rating == 0 || num_votes == 0

        # Store IMDb records by ID
        imdb_by_id[imdb_id] = {
          title: title,
          release_year: release_year,
          vote_average: average_rating,
          vote_count: num_votes,
          media_type: normalized_type
        }

        # Store IMDb records by title
        key = "#{title}|#{normalized_type}"
        imdb_by_title[key] ||= []
        imdb_by_title[key] << {
          imdb_id: imdb_id,
          release_year: release_year,
          vote_average: average_rating,
          vote_count: num_votes,
          media_type: normalized_type
        }

        # Store IMDb records by title and year
        if release_year > 0
          key = "#{title}|#{release_year}|#{normalized_type}"
          imdb_by_title_year[key] = {
            imdb_id: imdb_id,
            vote_average: average_rating,
            vote_count: num_votes,
            media_type: normalized_type
          }
        end

        total_imdb_records += 1
      rescue => e
        puts "Error processing IMDb row: #{e.message}"
      end
    end

    puts "Loaded #{total_imdb_records} IMDb records"

    # Second pass: Load all movies into memory
    puts "Loading all movies from database..."
    all_movies = Movie.all.to_a
    puts "Loaded #{all_movies.size} movies from database"

    # Third pass: Update movies in memory
    updated_movies = []
    puts "Updating movies in memory..."

    all_movies.each do |movie|
      updated = false

      # Case 1: Direct IMDb ID match
      if movie.imdb_id.present? && imdb_data = imdb_by_id[movie.imdb_id]
        # Make sure media_type matches
        if imdb_data[:media_type] == movie.media_type
          movie.vote_average = imdb_data[:vote_average]
          movie.vote_count = imdb_data[:vote_count]
          updated = true
          puts "Matched by IMDb ID: #{movie.title} (#{movie.release_date&.year})"
          # links
          puts "IMDb Link: https://www.imdb.com/title/#{movie.imdb_id}"
          puts "TMDB Link: https://www.themoviedb.org/#{movie.media_type}/#{movie.tmdb_id}"
        end
      # Case 2: Title and release year match
      elsif movie.title.present? && movie.original_title.present? &&
            movie.title.downcase == movie.original_title.downcase &&
            movie.release_date && movie.release_date.year > 0
        key = "#{movie.title}|#{movie.release_date.year}|#{movie.media_type}"
        if imdb_data = imdb_by_title_year[key]
          # Double-check media_type
          if imdb_data[:media_type] == movie.media_type
            movie.imdb_id = imdb_data[:imdb_id]
            movie.vote_average = imdb_data[:vote_average]
            movie.vote_count = imdb_data[:vote_count]
            updated = true
            puts "Matched by title and year: #{movie.title} (#{movie.release_date.year})"
            # links
            puts "IMDb Link: https://www.imdb.com/title/#{movie.imdb_id}"
            puts "TMDB Link: https://www.themoviedb.org/#{movie.media_type}/#{movie.tmdb_id}"
          end
        end
      end

      updated_movies << movie if updated

      # Print progress
      if updated_movies.size % 1000 == 0
        print "\rUpdated #{updated_movies.size} movies so far..."
      end
    end

    # Fourth pass: Bulk save only updated movies in batches
    puts "\nSaving updated movies to database in batches of 5000..."

    total_saved = 0
    batch_size = 5000
    total_movies = updated_movies.size

    # Import in batches of 5000
    updated_movies.each_slice(batch_size) do |batch|
      Movie.import batch, validate: false, timestamps: false, on_duplicate_key_update: {
        conflict_target: [:tmdb_id, :media_type],
        columns: [:imdb_id, :vote_average, :vote_count, :release_date]
      }
      total_saved += batch.size
      print "\rSaved #{total_saved}/#{total_movies} updated movies (#{(total_saved.to_f/total_movies*100).round(2)}%)..."
    end

    puts "\nCompleted IMDb overlay. Total updated movies reimported: #{updated_movies.size}"
  end

  def download_with_progress(url, output_path)
    begin
      uri = URI(url)

      # Start the download with GET request
      Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == 'https') do |http|
        request = Net::HTTP::Get.new(uri)

        http.request(request) do |response|
          case response
          when Net::HTTPSuccess
            bytes_downloaded = 0

            File.open(output_path, 'wb') do |file|
              response.read_body do |chunk|
                file.write(chunk)
                bytes_downloaded += chunk.size
                print "\rDownloaded: #{bytes_downloaded} bytes"
              end
            end

            if File.size(output_path).zero?
              raise "Downloaded file is empty. Please verify the URL or download manually."
            end

            puts "\nDownload completed successfully!"
          when Net::HTTPRedirection
            # Follow redirect
            location = response['location']
            puts "Redirecting to: #{location}"
            download_with_progress(location, output_path)
          else
            raise "HTTP Error: #{response.code} - #{response.message}"
          end
        end
      end

    rescue StandardError => e
      puts "Error downloading file: #{e.message}"
      if File.exist?(output_path)
        puts "Removing partially downloaded file..."
        File.delete(output_path)
      end

      puts "\nAlternative download options:"
      puts "1. Download manually from the provided URL."
      puts "2. Place the file at #{output_path}"
      puts "3. Run this task again"

      exit 1
    end
  end
end
