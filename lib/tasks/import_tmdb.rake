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
    # download_and_extract(movie_kaggle_url, movie_csv_path, 'movies.zip')
    # activerecord_batch_import(movie_csv_path, batch_size, 'movie')

    # Download and extract TV shows
    download_and_extract(tv_kaggle_url, tv_csv_path, 'tv')
    activerecord_batch_import(tv_csv_path, batch_size, 'tv')

    puts "TMDB import completed!"
  end

  private

  def download_and_extract(kaggle_url, csv_path, zip_name)
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
      system("unzip -j #{download_path} -d #{Rails.root.join('tmp')}")
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

  # Helper method to download file with progress bar
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
