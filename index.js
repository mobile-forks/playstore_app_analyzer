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
var cfg = require("./config");
var framework = "";
var listActivities = true;
var logFile = "log_" + (new Date().getTime()) + ".html";

var CATEGORY =  gplay.category[cfg.category];
var COLLECTION = gplay.collection[cfg.collection]
var DOWNLOAD_COUNT = cfg.downloadCount;
var COUNTRY = cfg.country;

if  (argv.keepFile || argv.kf); {
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

// var http = require('http');
// http.createServer(function(req, res) {
// 	res.write('<html><head></head><body>');
// 	res.write('<p>Write your HTML content here</p>');
// 	res.end('</body></html>');
// }).listen(1337);

console.log("--------");
console.log("Settings");
console.log("--------");
console.log("Logfile: " + logFile);
console.log("Collection: " + COLLECTION);
console.log("Category: " + CATEGORY);
console.log("Country: " + COUNTRY);
console.log("Amount: " + DOWNLOAD_COUNT);
console.log("")
function outputText(txt) {
	console.log(txt.split("--").join("\t").split("<br>").join("\n").replace("<hr>", "\n"));

	var html = txt.replace('/(?:\r\n|\r|\n)/g', "<br>")
		.replace("[32m", "<strong>")
		.replace("[39m", "</strong>");

	fs.appendFile(logFile, html + "</br>", function(err) {});
}

function downloadToFile(pkg, vc) {
	return api.details(pkg).then(function(res) {
			return vc || res.details.appDetails.versionCode;
		})
		.then(function(versionCode) {
			var fname = apkFolder + pkg + '.apk';
			fs.stat(fname, function(err, stat) {
				if (err == null) {
					outputText("--File exists - skipping");
					getNext();
				} else if (err.code == 'ENOENT') {
					var fStream = fs.createWriteStream(fname);
					return api.download(pkg, versionCode).then(function(res) {
						res.pipe(fStream);
						fStream.on('finish', function() {
							checkApk(fname, listActivities);
						});
					}).catch(function() {
						outputText("--Download error - skipping");
						getNext();
					});

				}
			});
		}).catch(function(){
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
		outputText("Checking " + name);
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
		outputText("Download " + id + ": " + app.title)
		downloadToFile(app.appId, "");
	}
}

function getNext() {

	if (framework != "") {
		outputText(framework);
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
		framework = "--Framework: " + str.green;
	}
}

function apkDecompile(file) {
	if (extractApk) {
		if (fs.statSync(file).size > 1000) {
			outputText("--Extracting " + file + "...");
			apktool.apkTool_unpack(file, "_out", function(err, result) {
				if (err) {
					truncateFile(file);
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

					// output urls
					var obj = {
						'term': /(http|ftp|https):\/\/([\w_-]+(?:(?:\.[\w_-]+)+))([\w.,@?^=%&:/~+#-]*[\w@?^=%&/~+#-])?/,
						'flags': 'ig'
					};
					outputText("--Looking for urls...")
					findInFiles.find(obj, '_out/', '.xml$')
						.then(function(results) {
							var output = [];
							for (var result in results) {
								var res = results[result];
								if (res.matches) {
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
							truncateFile(file);
							getNext();

						});
				}
			})
		}
	} else {
		truncateFile(file);
		getNext();
	}
}

function truncateFile(file) {
	if (clearFile && !isLocal) {
		fs.truncate(file, 0, function() {
			console.log('--clearing file')
		})
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
} else if (argv.appId){
	downloadToFile(argv.appId, "");
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
			download(currentDownload);
		}, {});
}
