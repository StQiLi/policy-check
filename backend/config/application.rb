require_relative 'boot'

require 'rails'
require 'active_model/railtie'
require 'active_job/railtie'
require 'active_record/railtie'
require 'action_controller/railtie'

Bundler.require(*Rails.groups)

module ReturnClarityBackend
  class Application < Rails::Application
    config.load_defaults 7.2
    config.api_only = true

    config.time_zone = 'UTC'
    config.active_record.default_timezone = :utc

    config.generators do |g|
      g.test_framework :rspec
      g.fixture_replacement :factory_bot, dir: 'spec/factories'
    end
  end
end
