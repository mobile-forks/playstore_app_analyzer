# Playstore App Analyzer
# Synopsis
`node index.js [--local | --[hideActivities|ha] | --[notExtractApk|na] --[keepFile|kf] | --appId app.id]`

# Description
Will download APKs from the store or use local APKs and analyze them.
It will print out Acitivity names and urls that are found in the XML files.
To safe space it will set the filesyste to 0 at the end so it won't be downloaded again.

If it is a Cordova/Phonegap app it will check for a www/ folder and copy this to www/ so you can analyze it later on.

# Usage
* clone the repo
* run `npm install`
* Open the `config_sample.js` and insert your Playstore account. Save it to `config.js`
* set the `androidId` (e.g. use https://play.google.com/store/apps/details?id=com.evozi.deviceid) in `config.js`
* change the playstore settings (see https://github.com/facundoolano/google-play-scraper/blob/dev/lib/constants.js#L3 for values) in `config.js`
* run `node index.js`


# Example/Usage
```javascript
node index.js
```
Downloads APKs from the store and checks it

```javascript
node index.js --local
```

Will check all APKs inside the /apk folder

```javascript
node index.js --appId com.evozi.deviceid
```

Will download the app and check it

# Output
```
Download 30: Appname...
Checking ./apk/appinventor.app.id.apk
        Listing activities:
                .Screen1
                appinventor.app.id.Screen2
        Extracting ./apk/appinventor.app.id.apk...
        Looking for urls...

        Framework: Appinventor
```

# Parameters
* `--keepFile | --kf`<br>keep the APK file
* `--hideActivities | --ha`<br>Don't show the activity names
* `--notExtractApk | --na`<br>Don't extract the APK (only Activity names are shown)
* `--local`<br>parse the local apk/ folder
* `--appId com.abc.def`<br>download app and anlyse it
