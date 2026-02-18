class Feedback < ApplicationRecord
  belongs_to :policy_snapshot
  belongs_to :user
  
  ALLOWED_FIELDS = %w[returnWindow conditionRequirements fees returnShipping exclusions].freeze
  
  validates :field_name, presence: true, inclusion: { in: ALLOWED_FIELDS }
  validates :correction, presence: true
end
