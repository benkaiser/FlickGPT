require "net/http"
require "uri"
require "json"

class RecommendationsController < ApplicationController
  include ActionController::Live

  def create
    response.headers["Content-Type"] = "text/event-stream"
    response.headers["Cache-Control"] = "no-cache"
    response.headers["Connection"] = "keep-alive"

    begin
      # Extract parameters
      interest_type = params[:interest_type] # 'imdb', 'favorites', 'genres'
      ratings_data = params[:ratings] # Array of rating objects for 'imdb'
      favorite_movies_data = params[:favorite_movies] # Array of {title, year} for 'favorites'
      genres_data = params[:genres] # Array of strings for 'genres'
      mood = params[:mood] || "whatever" # String, e.g., 'need-a-laugh'
      media_type = params[:media_type] || "movie" # 'movie', 'tv', 'both'

      # Validate input based on interest_type
      valid_input = case interest_type
        when "imdb"
          ratings_data.present?
        when "favorites"
          favorite_movies_data.present?
        when "genres"
          genres_data.present?
        else
          false
        end

      unless valid_input
        response.stream.write("data: #{JSON.generate({ error: "Invalid or missing interest data provided" })}\n\n")
        response.stream.write("data: [DONE]\n\n")
        return
      end

      # Prepare data for the prompt
      prompt_data = {
        interest_type: interest_type,
        ratings: ratings_data,
        favorite_movies: favorite_movies_data,
        genres: genres_data,
        mood: mood,
        media_type: media_type,
      }

      prompt = generate_llm_prompt(prompt_data)
      Rails.logger.info("Generated Prompt: #{prompt}") # Log for debugging

      # Stream response from DeepInfra (or other LLM provider)
      uri = URI.parse(ENV.fetch("LLM_API_URL", "https://api.deepinfra.com/v1/openai/chat/completions"))
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = true

      request = Net::HTTP::Post.new(uri.path)
      request["Content-Type"] = "application/json"
      request["Authorization"] = "Bearer #{ENV["DEEPINFRA_API_KEY"]}" # Ensure API key is set

      request.body = JSON.generate({
        model: ENV.fetch("LLM_MODEL", "meta-llama/Llama-3.3-70B-Instruct-Turbo"),

        stream: true,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You are a movie and TV show recommendation assistant. Respond ONLY with the requested JSON format. DO NOT recommend any titles mentioned by the user, they do not want to see them again." },
          { role: "user", content: prompt },
          interest_type == "imdb" ? { role: "system", content: "I will make sure to avoid recommending the following titles: #{ratings_data.map { |m| "#{m["title"]} (#{m["year"]})" }.join(", ")}" } : nil
        ].compact, # Remove nil entries
      # Optional: Adjust temperature or other parameters if needed
      # temperature: 0.7
      })

      http.request(request) do |api_response|
        unless api_response.code == "200"
          error_body = api_response.body rescue "Unknown API error"
          Rails.logger.error("LLM API Error: #{api_response.code} - #{error_body}")
          response.stream.write("data: #{JSON.generate({ error: "API request failed", status: api_response.code, details: error_body })}\n\n")
          response.stream.write("data: [DONE]\n\n")
          return
        end

        buffer = ""
        api_response.read_body do |chunk|
          buffer << chunk
          # Process buffer line by line for SSE events
          while (line_end = buffer.index("\n")) != nil
            line = buffer.slice!(0, line_end + 1).strip
            # Forward valid SSE lines directly to the client
            if line.start_with?("data:")
              response.stream.write("#{line}\n\n") # Ensure double newline for SSE
            elsif line.present? && !line.start_with?("event:") && !line.start_with?("id:") && !line.start_with?(":")
              # Log unexpected lines from the API if necessary
              Rails.logger.warn("Unexpected LLM API output line: #{line}")
            end
          end
        end
        # Process any remaining data in the buffer after the stream ends
        if buffer.strip.start_with?("data:")
          response.stream.write("#{buffer.strip}\n\n")
        end
      end

      response.stream.write("data: [DONE]\n\n")
    rescue IOError => e
      # Client disconnected
      Rails.logger.info("Client disconnected: #{e.message}")
    rescue StandardError => e
      Rails.logger.error("Recommendation Error: #{e.message}\n#{e.backtrace.join("\n")}")
      response.stream.write("data: #{JSON.generate({ error: "An internal server error occurred: #{e.message}" })}\n\n")
      response.stream.write("data: [DONE]\n\n")
    ensure
      response.stream.close
    end
  end

  private

  def generate_llm_prompt(data)
    interest_section = case data[:interest_type]
      when "imdb"
        <<~IMDB
          My rated movies/shows (Title (Year) - Rating/10):
          #{data[:ratings].map { |m| "#{m["title"]} (#{m["year"]}) - #{m["user_rating"]}/10" }.join(", ")}
        IMDB
      when "favorites"
        <<~FAVORITES
          Some of my favorite movies/shows are:
          #{data[:favorite_movies].map { |m| "#{m["title"]} (#{m["year"]})" }.join("\n")}
        FAVORITES
      when "genres"
        <<~GENRES
          I enjoy the following genres:
          #{data[:genres].join(", ")}
        GENRES
      else
        "" # Should not happen due to validation
      end

    preferences_section = <<~PREFS
      Scope the recommendatinos down to #{data[:media_type] == "both" ? "movies or TV shows" : (data[:media_type] == "tv" ? "TV shows" : "movies")}.
      My current mood is: #{data[:mood] == "Whatever" ? "flexible, surprise me!" : data[:mood].gsub("-", " ")}.
    PREFS

    <<~PROMPT
      Based on my interests below, please recommend 10 new titles that I haven't seen before.

      #{interest_section.strip}

      #{preferences_section.strip}

      Please respond ONLY in this exact JSON format and nothing else:
      ```json
      {
        "recommendations": [
          {
            "title": "Movie or TV Show Title",
            "year": YYYY,
            "reason": "A brief explanation of 1-2 sentences on why this title is recommended for me based on my interests."
          },
          {
            "title": "Another Show",
            "year": YYYY,
            "reason": "..."
          },
          ...more titles
        ]
      }
      ```

      Please provide me with the 10 recommendations of titles not in the above list.
    PROMPT
  end
end
