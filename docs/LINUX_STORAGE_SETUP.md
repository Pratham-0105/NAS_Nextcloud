# Linux Host Storage & mergerfs Setup Guide

This guide details the physical storage management configuration for your host machine (Spare PC, Laptop, or Raspberry Pi running Ubuntu/Debian).

---

## 1. Prerequisites on Linux Host

Install `mergerfs`, `smartmontools`, and standard disk utilities:

```bash
sudo apt-get update
sudo apt-get install -y mergerfs util-linux smartmontools e2fsprogs exfat-fuse ntfs-3g
```

---

## 2. Directory Layout for Dynamic Storage

Create the mount points used by our application:

```bash
# Directory where individual physical drives are attached:
sudo mkdir -p /mnt/devices

# Directory where the unified mergerfs storage pool is mounted:
sudo mkdir -p /mnt/storage_pool

# Permissions for Nextcloud container (UID 33 = www-data):
sudo chown -R 33:33 /mnt/storage_pool
sudo chmod -R 775 /mnt/storage_pool
```

---

## 3. How mergerfs Works Under the Hood

When you add a device via our **Admin Storage Portal**, the backend executes:

```bash
# Example mounting individual disk:
sudo mount /dev/sdb1 /mnt/devices/usb-hdd1

# mergerfs union command:
sudo mergerfs -o category.create=mfs,cache.files=off,allow_other \
  /mnt/devices/* /mnt/storage_pool
```

### Explanation of parameters:
- `category.create=mfs` (Most Free Space): Directs any new file upload from Nextcloud to the drive that currently has the most available megabytes.
- `cache.files=off`: Disables internal file caching to enable safe hot-unplugging without stale kernel cache corruption.
- `allow_other`: Enables Docker containers running with non-root UID (such as Nextcloud's `www-data`) to read and write.
