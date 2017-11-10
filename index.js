var gplay = require('google-play-scraper');
const fs = require('fs-extra');
var path = require("path");
var util = require('util');
var unzip = require('unzip');
var ApkReader = require('node-apk-parser');
var sleep = require('sleep');
var appList = [];
var currentDownload = 0;
var colors = require("colors");
var argv = require('minimist')(process.argv.slice(2));
var clearFile = true;
var extractApk = true;
var apktool = require("node_apktool");
apktool.settings.apkToolPath = "./node_modules/node_apktool";
var rmrf = require("rmrf");
var findInFiles = require('find-in-files');
var currentFile = 0;
var files = [];
var apkFolder = "./apk/";
var wwwFolder = "./www/";
var isLocal = false;
if (!fs.existsSync("config.js")) {
	console.error("Please create a config.js first".red);
	process.exit();
}
var cfg = require("./config");
var framework = "";
var listActivities = true;
var logFile = "log_" + (new Date().getTime()) + ".html";
var isForce = false;
var appId = "";
var Database = require('better-sqlite3');
var db = new Database('database.db');
var ora = require('ora');
var spinner = ora('');

try {
	if (db.prepare("SELECT version FROM apps").get() != 1) {
		// migrate
	}
} catch (error) {
	//
}
db.prepare("CREATE TABLE IF NOT EXISTS apps (appId TEXT, framework TEXT, date INT)").run();

var CATEGORY = gplay.category[cfg.category];
var COLLECTION = gplay.collection[cfg.collection]
var DOWNLOAD_COUNT = cfg.downloadCount;
var COUNTRY = cfg.country;

if (argv.keepFile || argv.kf) {
	clearFile = false;
}
if (argv.hideActivities || argv.ha) {
	listActivities = false;
}
if (argv.notExtractApk || argv.na) {
	extractApk = false;
}

rmrf('_out/');

if (!fs.existsSync(apkFolder)) {
	fs.mkdirSync(apkFolder);
}
if (!fs.existsSync(wwwFolder)) {
	fs.mkdirSync(wwwFolder);
}

var api = require('gpapi').GooglePlayAPI({
	username: cfg.username,
	password: cfg.password,
	androidId: cfg.androidId
});

console.log("--------");
console.log("Settings");
console.log("--------");
console.log("Logfile: " + logFile);

if (argv.appId) {
	console.log("Download: " + argv.appId);
} else {
	console.log("Collection: " + COLLECTION);
	console.log("Category: " + CATEGORY);
	console.log("Country: " + COUNTRY);
	console.log("Amount: " + DOWNLOAD_COUNT);
}
console.log("")

function outputText(txt) {
	console.log(txt.split("--").join("\t").split("<br>").join("\n").replace("<hr>", "\n"));

	var html = txt.replace('/(?:\r\n|\r|\n)/g', "<br>")
		.replace("[32m", "<strong>")
		.replace("[39m", "</strong>");

	fs.appendFile(logFile, html + "</br>", function(err) {});
}

function downloadToFile(pkg, vc) {
	var dldSize = 0;
	appId = pkg;

	return api.details(pkg).then(function(res) {
			dldSize = (res.details.appDetails.installationSize.low / 1024 / 1024).toPrecision(2) + "Mb"
			return vc || res.details.appDetails.versionCode;
		})
		.then(function(versionCode) {
			var fname = apkFolder + pkg + '.apk';
			if (db.prepare("SELECT count(*) AS count FROM apps WHERE appId='" + pkg + "'").get().count == 0 || isForce) {
				if (isForce) {
					db.prepare("DELETE FROM apps WHERE appId='" + pkg + "'").run();
				}
				console.log("\tDownload size: " + dldSize);
				var fStream = fs.createWriteStream(fname);
				return api.download(pkg, versionCode).then(function(res) {
					spinner.start("\tDownloading...");
					res.pipe(fStream);
					fStream.on('finish', function() {
						spinner.stop();
						db.prepare("INSERT INTO apps VALUES ('" + pkg + "','', " + new Date().getTime() + ")").run();
						checkApk(fname, listActivities);
					});
				}).catch(function() {
					outputText("--Download error - skipping");
					getNext();
				});
			} else {
				outputText("--Skipping: Already in DB");
				getNext();
			}
		}).catch(function() {
			// error
			console.error("error connecting...wait 5sec");
			sleep.sleep(5);
			api = require('gpapi').GooglePlayAPI({
				username: cfg.username,
				password: cfg.password,
				androidId: cfg.androidId
			});
			getNext();
		})
}

function checkApk(name, showActivities = false) {
	try {
		outputText("--Checking " + name);
		var reader = ApkReader.readFile(name)
		var manifest = reader.readManifestSync();
		var act = manifest.application.activities;
		var libr = "";

		if (showActivities) {
			outputText("--Listing activities:");
		}
		for (var i = 0; i < act.length; ++i) {

			if (libr == "") {
				if (showActivities) {
					outputText("----" + act[i].name);
				}
				if (act[i].name.indexOf("appcelerator") > -1) {
					libr = "Axway Appcelerator";
				} else if (act[i].name.indexOf("cordova") > -1) {
					libr = "Cordova";
				} else if (act[i].name.indexOf("phonegap") > -1) {
					libr = "Cordova";
				} else if (act[i].name.indexOf("UnityPlayerNativeActivity") > -1) {
					libr = "Unity3D";
				} else if (act[i].name.indexOf("UnityPlayerActivity") > -1) {
					libr = "Unity3D";
				} else if (act[i].name.indexOf("com.appsgeyser") > -1) {
					libr = "Appsgeyser";
				} else if (act[i].name.indexOf("com.attendify") > -1) {
					libr = "Attendify";
				} else if (act[i].name.indexOf("appinventor") > -1) {
					libr = "Appinventor";
				}
			}
		}
		if (libr != "") {
			setFramework(libr);
		}
		apkDecompile(name);
	} catch (e) {
		apkDecompile(name);
	}
}

function download(id) {
	var app = appList[id];
	if (app) {
		outputText("Download " + (id + 1) + "/" + appList.length + ": " + app.title)
		downloadToFile(app.appId, "");
	}
}

function getNext() {

	if (framework != "") {
		db.prepare("UPDATE apps SET framework='" + framework + "' WHERE appId='" + appId + "'").run();
		outputText("--Framework: " + framework.green);
		framework = "";
	}

	outputText("<hr>");

	if (isLocal) {
		if (currentFile + 1 < files.length) {
			currentFile++;
			checkApk(apkFolder + files[currentFile]);
		}
	} else {

		if (currentDownload < appList.length - 1) {
			currentDownload++;
			download(currentDownload);
		} else {
			outputText("Done".green);
			process.exit()
		}
	}
}

function setFramework(str) {
	if (framework == "") {
		framework = str;
	}
}

function apkDecompile(file) {
	if (extractApk) {
		if (fs.statSync(file).size > 1000) {
			outputText("--Extracting " + file + "...");
			apktool.apkTool_unpack(file, "_out", function(err, result) {
				if (err) {
					deleteFile(file);
					getNext();
				} else {
					// TODO analyse xmls
					// findInFiles.find('[="]([0-9a-zA-Z/+]{40})[&"]', '_out/', '.xml$')

					// find cordova/phonegap www folders and save them
					if (fs.existsSync("_out/assets/www")) {
						outputText("--Found cordova folder, saving it...".green);
						fs.copySync("_out/assets/www", wwwFolder + file);
						setFramework("Cordova");
					}

					try {
						// find xamarin
						var obj = {
							'term': /xamarin/,
							'flags': 'ig'
						};
						findInFiles.findSync(obj, '_out/', 'apktool.yml$')
							.then(function(results) {
								for (var result in results) {
									var res = results[result];
									if (res && res.count > 0) {
										setFramework("Xamarin");
									}
								}
							});

						// find Appcelerator
						var obj = {
							'term': /org\/appcelerator\/titanium/,
							'flags': 'ig'
						};
						findInFiles.findSync(obj, '_out/', 'apktool.yml$')
							.then(function(results) {
								for (var result in results) {
									var res = results[result];
									if (res && res.count > 0) {
										setFramework("Axway Appcelerator");
									}
								}
							});
					} catch (e) {
						// error
					}

					try {
						// output urls
						var obj = {
							'term': /(http|ftp|https):\/\/([\w_-]+(?:(?:\.[\w_-]+)+))([\w.,@?^=%&:/~+#-]*[\w@?^=%&/~+#-])?/,
							'flags': 'ig'
						};
						outputText("--Looking for urls...")
						findInFiles.findSync(obj, '_out/', '.xml$')
							.then(function(results) {
								var output = [];
								for (var result in results) {
									var res = results[result];
									if (res && res.matches) {
										res.matches.forEach(function(match) {

											if (framework == "" && match.indexOf("ns.adobe.com/air/extension/4.0") != -1) {
												setFramework("Adobe Air");
											}

											if (output.indexOf(match) < 0 &&
												match.indexOf("schemas.android.com/") == -1 &&
												match.indexOf("ns.adobe.com/air/extension/4.0") == -1 &&
												match.indexOf("https://play.google.com/store/apps/details?id=") == -1 &&
												match != "http://www.w3.org/2001/XMLSchema-instance"
											) {
												output.push(match);
											}
										});
									}
								}
								outputText("----" + output.join("<br>----"));
								rmrf('_out/');
								deleteFile(file);
								getNext();

							});
					} catch (e) {
						rmrf('_out/');
						deleteFile(file);
						getNext();
					}
				}
			})
		}
	} else {
		deleteFile(file);
		getNext();
	}
}

function deleteFile(file) {
	if (clearFile && !isLocal) {
		fs.unlink(file);
	}
}

if (argv.local) {
	fs.readdir(apkFolder, function(err, f) {
		isLocal = true;
		f.forEach(function(file) {
			// only use apks
			if (path.extname(file) == ".apk") {
				files.push(file);
			}
		})
		checkApk(apkFolder + files[0], listActivities);
	})

} else if (argv.file) {
	isLocal = true;
	files = [argv.file];
	checkApk(argv.file, listActivities);
} else if (argv.appId) {
	downloadToFile(argv.appId, "");
	isForce = true;
} else {

	// https://github.com/facundoolano/google-play-scraper/blob/dev/lib/constants.js#L3
	gplay.list({
			category: CATEGORY,
			collection: COLLECTION,
			num: DOWNLOAD_COUNT,
			country: COUNTRY
		})
		.then(function(data) {
			appList = data;

			var oldLen = appList.length;
			var appCount = 0;
			if (argv.similar) {
				spinner.start("Get similar apps");
				appList.forEach(function(item) {
					gplay.similar({
						appId: item.appId
					}).then(function(data) {
						appList = appList.concat(data.slice(0, argv.similar));
						appCount++;
						spinner.start("Get similar apps " + appCount + "/" + (oldLen - 1));
						if (appCount > oldLen - 1) {
							spinner.stop();
							download(currentDownload);
						}
					});
				});
			} else {
				download(currentDownload);
			}
		}, {});
}
