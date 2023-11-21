//#region Constant
const CLIENT_ID = '';
const API_KEY = '';
const DISCOVERY_DOCS = ['https://sheets.googleapis.com/$discovery/rest?version=v4', 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.metadata https://www.googleapis.com/auth/drive.readonly';
const APP_ID = '';
//#endregion

//#region Global VAR
let accessToken = null;
let tokenClient;
let gapiInited = false;
let gisInited = false;
let SELECTED_FILE_ID = ''
let FOLDER_USCITA = ''
let FOLDER_ENTRATA = ''
let index = 0;
let signaturePad, canvas, OldSignature, latestNo;
let $table = $('#table');
let $formUscita = $('#receiptsFormUscita')
let $formEntrata = $('#receiptsFormEntrata')
//#endregion

//#region Initializer
canvas = document.querySelector("canvas");
signaturePad = new SignaturePad(canvas);
OldSignature = localStorage.getItem("Signature");
if (OldSignature) {
    signaturePad.fromDataURL(OldSignature);
}

if (latestNo) {
    document.getElementsByName("LastNo")[0].value = latestNo;
}

$("#authorize_button").css("visibility", "hidden");
$("#signout_button").css("visibility", "hidden");
$("#RefreshButton").css("visibility", "hidden");
$("#Pagecontent").css("visibility", "hidden");

$("#datepickerEntrata").datepicker({
    dateFormat: 'dd/mm/yy'
}).datepicker("setDate", new Date());
$("#datepickerUscita").datepicker({
    dateFormat: 'dd/mm/yy'
}).datepicker("setDate", new Date());

$table.bootstrapTable({
    search: true,
    columns: [{
        field: 'Nos',
        title: 'Riferimento Giustificativo'
    }, {
        field: 'date',
        title: 'Data'
    }, {
        field: 'description',
        title: 'Descrizione'
    }, {
        field: 'income',
        title: 'Entrata'
    }, {
        field: 'outcome',
        title: 'Uscita'
    }],
    data: []
})
//#endregion

//#region Google Auth & Consent
function gapiLoaded() {
    gapi.load('client:picker', initializeGapiClient);
}
async function initializeGapiClient() {
    await gapi.client.init({
        apiKey: API_KEY,
        discoveryDocs: DISCOVERY_DOCS,
    });
    gapiInited = true;
    maybeEnableButtons();
}
function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '', // defined later
    });
    gisInited = true;
    maybeEnableButtons();
}
function maybeEnableButtons() {
    if (gapiInited && gisInited) {
        document.getElementById('authorize_button').style.visibility = 'visible';
    }
}
function handleAuthClick() {
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            throw (resp);
        }
        accessToken = resp.access_token;

        document.getElementById('signout_button').style.visibility = 'visible';
        document.getElementById('RefreshButton').style.visibility = 'visible';
        document.getElementById('authorize_button').innerText = 'Refresh';
        $("#Pagecontent").css("visibility", "visible");
        $("#Authorize").css("visibility", "hidden");
        createPicker();
    };

    if (gapi.client.getToken() === null) {
        // Prompt the user to select a Google Account and ask for consent to share their data
        // when establishing a new session.
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        // Skip display of account chooser and consent dialog for an existing session.
        tokenClient.requestAccessToken({ prompt: '' });
    }
}
function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
        document.getElementById('content').innerText = '';
        document.getElementById('authorize_button').innerText = 'Authorize';
        document.getElementById('signout_button').style.visibility = 'hidden';
        $("#Pagecontent").css("visibility", "hidden");       
        $("#Authorize").css("visibility", "visible"); 
    }
}
//#endregion

//#region Google file Picker
function createPicker() {
    var docsViewMine = new google.picker.DocsView()
        .setIncludeFolders(true)
        .setOwnedByMe(true)
        .setSelectFolderEnabled(true);

    var docsViewTeam = new google.picker.DocsView()
        .setIncludeFolders(true)
        .setEnableTeamDrives(true)
        .setSelectFolderEnabled(true);

    var docsViewStarred = new google.picker.DocsView()
        .setIncludeFolders(true)
        .setStarred(true)
        .setSelectFolderEnabled(true);

    const picker = new google.picker.PickerBuilder()
        .setDeveloperKey(API_KEY)
        .enableFeature(google.picker.Feature.SUPPORT_TEAM_DRIVES)
        .enableFeature(google.picker.Feature.SUPPORT_DRIVES)
        .setAppId(APP_ID)
        .setOAuthToken(accessToken)
        .addView(docsViewMine)
        .addView(docsViewTeam)
        .addView(docsViewStarred)
        .setCallback(pickerCallback)
        .build();
    picker.setVisible(true);
}


async function pickerCallback(data) {
    if (data.action === google.picker.Action.PICKED) {
        let text = `Picker response: \n${JSON.stringify(data, null, 2)}\n`;
        const pdocument = data[google.picker.Response.DOCUMENTS][0];
        const fileId = pdocument[google.picker.Document.ID];
        SELECTED_FILE_ID = fileId;
        let parentID = pdocument["parentId"]
        //         FOLDER_USCITA
        // FOLDER_ENTRATA
        let response;
        try {
            // Fetch first 10 files
            response = await gapi.client.drive.files.list({
                q: 'mimeType = \'application/vnd.google-apps.folder\' and \'' + parentID + '\' in parents',
                fields: 'nextPageToken, files(id, name)',
                spaces: 'drive',
            });
        } catch (err) {
            document.getElementById('content').innerText = err.message;
            return;
        }
        for (var index in response.result.files) {
            if (response.result.files[index].name === "Entrate") {
                FOLDER_ENTRATA = response.result.files[index].id
            } else if (response.result.files[index].name === "Uscite") {
                FOLDER_USCITA = response.result.files[index].id
            }
        }
        ReadFromSpreadsheet()
    }
}
//#endregion

//#region Google Spreadsheet
async function ReadFromSpreadsheet() {
    let response;
    try {
        response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: SELECTED_FILE_ID,
            range: 'Libro Cassa!D7:H406',
        });
    } catch (err) {
        document.getElementById('content').innerText = err.message;
        return;
    }
    const range = response.result;
    if (!range || !range.values || range.values.length == 0) {
        document.getElementById('content').innerText = 'No values found.';
        return;
    }
    var obj = []
    // Flatten to string to display
    for (var test in response.result.values) {
        obj.push({
            "Nos": response.result.values[test][0] ?? "",
            "date": response.result.values[test][1] ?? "",
            "description": response.result.values[test][2] ?? "",
            "income": response.result.values[test][3] ?? 0,
            "outcome": response.result.values[test][4] ?? 0,
        })
    }
    $table.bootstrapTable('load', obj)

}

async function PushDataToSpreasheet(data, range) {
    let values = [];
    for (var i in data) {
        values.push(Object.values(data[i]))
    }
    const body = {
        values: values,
    };
    try {
        let response;
        let startRowNr = 0;
        try {
            response = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: SELECTED_FILE_ID,
                range: 'Libro Cassa!D7:H406',
            });
            startRowNr = response.result.values.length
        } catch (err) {
            //possible no new lines 
            startRowNr  = 0
        }
        gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: SELECTED_FILE_ID,
            range: 'Libro Cassa!D'+( startRowNr+ 7),
            valueInputOption: "USER_ENTERED",
            resource: body,
        }).then((response) => {
            const result = response.result;
            ReadFromSpreadsheet()
        });
    } catch (err) {
        document.getElementById('content').innerText = err.message;
        return;
    }
}
//#endregion

//#region Drive
async function UploadFile(name, mime, data, folderId) {
    var metadata = {
        'name': name, // Filename at Google Drive
        'mimeType': mime, // mimeType at Google Drive
        'parents': [folderId], // Folder ID at Google Drive
    };
    
    var accessToken = gapi.auth.getToken().access_token; // Here gapi is used for retrieving the access token.
    var form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', data);
    
    fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
        method: 'POST',
        headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
        body: form,
    }).then((res) => {
        return res.json();
    }).then(function(val) {
    });
}
//#endregion

//#region Forms
$formUscita.on("submit", (event) => {
    event.preventDefault();
    var data = getFormData($formUscita);
    var tempNos = BuildNos(data.LastNo)
    var dataArr = [];
    var builded = {
        "Nos": tempNos,
        "date": data.Date,
        "description": data.Reason,
        "income": null,
        "outcome": data.Total,
    };
    dataArr.push(builded);
    tempNos = IncreaseNos(tempNos);

    $formUscita.find("[name='LastNo']")[0].value = tempNos;
    PushDataToSpreasheet(dataArr)
    var file = $formUscita.find("[name='Giustificativo']")[0].files[0]
    UploadFile(dataArr[0].Nos, file.type, file,FOLDER_USCITA)
    alert("Generato!")
    return false;
})

$formEntrata.on("submit", (event) => {
    event.preventDefault();
    var data = getFormData($formEntrata);
    var holders = data.Holder.split("\r\n");
    var tempNos = BuildNos(data.LastNo)
    var dataArr = [];
    for (var single in holders) {
        var builded = {
            "LastNo": tempNos,
            "Date": data.Date,
            "Holder": holders[single],
            "Reason": data.Reason,
            "Price": data.Price,
            "Total": data.Total,
            "No": tempNos
        };
        dataArr.push(builded);
        tempNos = IncreaseNos(tempNos);
    }
    if (data.MakeInvoices === "on") {
        GenerateReceipts(dataArr)
    }

    let dataSheet = [];
    for (var index in dataArr) {
        dataSheet.push({
            "Nos": dataArr[index].No,
            "date": dataArr[index].Date,
            "description": dataArr[index].Reason + " - " + dataArr[index].Holder,
            "income": dataArr[index].Total,
            "outcome": null,
        })
    }
    PushDataToSpreasheet(dataSheet)

    $formEntrata.find("[name='LastNo']")[0].value = tempNos;

    alert("Generato!")
    return false;
})
//#endregion

//#region Receipts
async function GenerateReceipts(data){
    var ret = addSignatureToTemplate();
    if (ret) {
        $("#Links").empty();
        var template = $("#template").clone().removeAttr("style").html();
        var $content = $("#all");

        for (var element in data) {
            var edited = template
            Object.keys(data[element]).forEach(val => {
                edited = edited.replaceAll("{{" + val + "}}", data[element][val]);
            })
            $content.append(edited)
        };
        var res = document.getElementById('all').getElementsByClassName('Content');

        
        Array.prototype.forEach.call(res, function (elem) {
            var options = {
                width: 1920,
                height: 500
            }
            domtoimage.toBlob(elem, options).then(function (dataUrl) {
                UploadFile(elem.getAttribute("data-id") + ".png", dataUrl.type, dataUrl,FOLDER_ENTRATA)
                elem.remove();
                //downloadURI(dataUrl, elem.getAttribute("data-id"));
              
            })
        });

    }

}
//#endregion

//#region Signature
function addSignatureToTemplate() {
    if (signaturePad.isEmpty()) {
        alert("Please provide a signature first.");
        return false;
    }

    var data = signaturePad.toDataURL('image/png');
    document.getElementById("ReceiptSignature").src = data;
    return true;
}

function ClearSignaturePad() {
    signaturePad.clear();
    localStorage.removeItem("Signature");
}

function SaveSignature() {
    if (signaturePad.isEmpty()) {
        return alert("Please provide a signature first.");
    }

    var data = signaturePad.toDataURL('image/png');
    localStorage.setItem("Signature", data);
}

function ImportSignature() {
    $("#ImportExistingSignature").val("")
    ClearSignaturePad()
    $("#ImportExistingSignature").click();
}

$("#ImportExistingSignature").on("change", function () {
    var reader = new FileReader();
    reader.onload = imageIsLoaded;
    reader.readAsDataURL($("#ImportExistingSignature")[0].files[0]);

})

function imageIsLoaded(e) {
    if (e.target.result.length > 0)
        signaturePad.fromDataURL(e.target.result, { ratio: 1 });
}
//#endregion

//#region Utils
function BuildNos(value) {
    if (value == "") value = "0";
    if (value.indexOf("-") != -1) {

    }
    var intvalue = parseInt((/([0-9]){1,}(?!-)/g.exec(value))[0]);
    var paddedVal = pad(intvalue, 5);
    var newVal = value.replace(/([0-9]){1,}(?!-)/g, paddedVal);
    return newVal;
}

function IncreaseNos(value) {
    var intvalue = parseInt((/([0-9]){1,}(?!-)/g.exec(value))[0]) + 1;
    var paddedVal = pad(intvalue, 5);
    var newVal = value.replace(/([0-9]){1,}(?!-)/g, paddedVal);

    return newVal;
}

function pad(str, max) {
    str = str.toString();
    return str.length < max ? pad("0" + str, max) : str;
}

function getFormData($form) {
    var unindexed_array = $form.serializeArray();
    var indexed_array = {};

    $.map(unindexed_array, function (n, i) {
        indexed_array[n['name']] = n['value'];
    });

    return indexed_array;
}

$('input[name="Total"]').on('input', function () {
    let tot = $('input[name="Total"]').val();
    $('input[name="Price"]').val(sgart.convNumLett(tot, false, false));

});
//#endregion