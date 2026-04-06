# Gunicorn configuration optimized for Raspberry Pi (low RAM)
# Usage: gunicorn -c gunicorn.conf.py skiboerse.wsgi:application

import multiprocessing

# Worker configuration
# For Raspberry Pi 4 (4GB RAM): Use 2-3 workers
# For Raspberry Pi 4 (2GB RAM): Use 2 workers
# Formula: (2 x CPU cores) + 1, but limited by RAM
workers = 2

# Use sync workers (most memory efficient)
# Alternative: 'gevent' for async but requires pip install gevent
worker_class = 'sync'

# Worker timeout - restart workers that take too long
timeout = 30

# Keep-alive connections (reduces connection overhead)
keepalive = 5

# Maximum requests per worker before restart (prevents memory leaks)
max_requests = 1000
max_requests_jitter = 50  # Add randomness to prevent all workers restarting at once

# Preload application (shares memory between workers)
preload_app = True

# Bind to Unix socket (faster than TCP)
bind = 'unix:/run/gunicorn.sock'

# Logging - minimal in production
accesslog = '-'
errorlog = '/var/log/gunicorn/error.log'
loglevel = 'warning'

# Process naming
proc_name = 'skiboerse'

# Limit request sizes to prevent memory exhaustion
limit_request_line = 4094
limit_request_fields = 100
limit_request_field_size = 8190
