# 数据目录

此目录用于存放应用所需的数据文件。

## GeoLite2 IP 地理位置数据库

### 下载地址

从 MaxMind 官网下载免费的 GeoLite2 City 数据库：

1. 注册账号：https://www.maxmind.com/en/geolite2/signup
2. 登录后下载：https://www.maxmind.com/en/accounts/current/geoip/downloads
3. 选择 `GeoLite2 City` -> `Download GZIP`
4. 解压后将 `GeoLite2-City.mmdb` 文件放到此目录

### 文件结构

```
data/
├── README.md
├── .gitkeep
└── GeoLite2-City.mmdb  <- 需要手动下载
```

### 更新频率

MaxMind 每周更新一次 GeoLite2 数据库，建议定期更新以保持 IP 地址解析准确性。

### 注意事项

- `GeoLite2-City.mmdb` 文件较大（约 60MB），已在 `.gitignore` 中忽略
- 如果没有此文件，IP 地理位置解析功能将自动降级（返回空值）
- 生产环境部署时需要确保此文件存在

