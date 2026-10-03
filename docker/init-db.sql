-- Initialize separate databases for our custom application and Nextcloud
CREATE DATABASE cloud_nas;
CREATE DATABASE nextcloud;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE cloud_nas TO cloud_admin;
GRANT ALL PRIVILEGES ON DATABASE nextcloud TO cloud_admin;
