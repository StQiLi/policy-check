require "active_support/core_ext/integer/time"

Rails.application.configure do
  config.enable_reloading = true
  config.eager_load = false
  config.consider_all_requests_local = true
  config.server_timing = true
  
  # Caching
  if Rails.root.join("tmp/caching-dev.txt").exist?
    config.cache_store = :memory_store
    config.public_file_server.headers = { "Cache-Control" => "public, max-age=#{2.days.to_i}" }
  else
    config.action_controller.perform_caching = false
    config.cache_store = :null_store
  end
  
  # Active Record
  config.active_record.migration_error = :page_load
  config.active_record.verbose_query_logs = true
  
  # Logging
  config.log_level = ENV.fetch("RAILS_LOG_LEVEL", "debug")
  
  # Raise exceptions
  config.action_controller.raise_on_missing_callback_actions = true
end
