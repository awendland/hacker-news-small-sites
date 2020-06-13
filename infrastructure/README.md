# Hacker News Small Sites: Infrastructure

## Usage

### 1. Initialize Terraform

A remote backend is used to store terraform state. The details of this state have been left out of the configuration for increased security (through obscurity, yay) and therefore must be provided during init. Create a backend configuration file containing:

```hcl
bucket = "name of the GCP cloud storage bucket that'll hold the state"
key    = "name of the state file in the bucket"
credentials = "full JSON of the credentials files downloaded from a service account"
```

Assume this file was named `backend-config.secret`. The init command would then be `tf init -backend-config=backend-config.secret`. Moving forward this file is no longer required.

### 2. Provide Config Variables

To increase portability several configuration items are left unspecified. These need to be provided to Terraform, such as by creating a `secret.auto.tfvars` file (any `*.auto.tfvars` file will automatically be loaded). The necessary variables are specified in the `*.tf` config files with the type `variable`.

### 3. Populate `top_sites` BigQuery Dataset

The BigQuery dataset `top_sites` will be created in the project with tables for different providers. However, these tables will not be populated.

One of the easier ways to load them is to use the `bq` CLI tool with `curl` and `awk`. For example,

```sh
curl http://downloads.majestic.com/majestic_million.csv -o majestic_million.source.csv
awk -F "\"*,\"*" '{print $3","$1}' majestic_million.source.csv | tail --lines=+2 > majestic_million.csv
bq load --project_id=hacker-news-small-sites --location=US --source_format=CSV top_sites.majestic_million majestic_million.csv
```

The `awk` pipe converts the default Majestic Million schema into `domain:STRING,rank:INTEGER` which is expected by the table.

#### Top Sites Sources

| Name             | Frequency | Summary Link                                                                                                             | Latest CSV Link                                                                       |
| ---------------- | --------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Majestic Million | Daily     | [Majestic Million CSV now free for all, daily (2012)](https://blog.majestic.com/development/majestic-million-csv-daily/) | [download](http://downloads.majestic.com/majestic_million.csv)                        |
| Cisco Umbrella   | Daily     | [Umbrella Popularity List](http://s3-us-west-1.amazonaws.com/umbrella-static/index.html)                                 | [download (s3).csv](http://s3-us-west-1.amazonaws.com/umbrella-static/top-1m.csv.zip) |
