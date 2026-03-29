"""Shared constants and configuration for the ORB strategy."""

# MNQ contract specifications
POINT_VALUE = 2.0        # Dollars per point per contract
TICK_SIZE = 0.25         # Minimum price increment
MAX_CONTRACTS = 40       # Maximum contracts allowed

# Default trading parameters
DEFAULT_ACCOUNT_SIZE = 50000.0
DEFAULT_ORB_MINUTES = 5
MAX_DAILY_LOSS = 2000.0     # Maximum allowed loss per day in dollars
DEFAULT_NUM_MINUTES = 390  # Full regular trading session (9:30-16:00)

# Market hours (ET)
MARKET_OPEN_HOUR = 9
MARKET_OPEN_MINUTE = 30

# GMT to ET offset (approximate, doesn't handle DST transitions)
GMT_TO_ET_HOURS = 4
