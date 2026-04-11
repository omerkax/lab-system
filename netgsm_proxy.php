<?php
/**
 * Alibey Laboratuvar - NetGSM Proxy v17 (301 REDIRECT FIX)
 * Sorgulama Metodu: HTTP GET (Versiyon 2)
 */
error_reporting(E_ALL);
ini_set('display_errors', 1);
header('Content-Type: text/plain; charset=utf-8');
header('Access-Control-Allow-Origin: *');

function netgsmRequest($url, $isXml = false, $postData = null)
{
    if (!function_exists('curl_init'))
        return "ERROR|CURL_MISSING";
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, 0);
    // 301/302 yönlendirmelerini takip et (NetGSM bazen iç dizine yönlendiriyor)
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);

    if ($isXml && $postData) {
        curl_setopt($ch, CURLOPT_HTTPHEADER, ["Content-Type: text/xml; charset=UTF-8"]);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
    }
    $res = curl_exec($ch);
    $err = curl_error($ch);
    // curl_close() is auto-closed in modern PHP
    return $res ? trim($res) : "ERROR|CURL_FAIL_" . $err;
}

$action = $_GET['action'] ?? 'balance';
$user = trim($_GET['usercode'] ?? '');
$pass = trim($_GET['password'] ?? '');
if (!$user || !$pass)
    die("ERROR|PARAMS_MISSING");

if ($action === 'send') {
    $url = "https://api.netgsm.com.tr/sms/send/get/?usercode=" . urlencode($user) . "&password=" . urlencode($pass) . "&gsmno=" . urlencode($_GET['gsmno'] ?? "") . "&message=" . urlencode($_GET['message'] ?? "") . "&msgheader=" . urlencode($_GET['msgheader'] ?? "") . "&dil=TR";
    $res = netgsmRequest($url);
    $parts = preg_split('/\s+/', $res, 2);
    $code = $parts[0];
    if ($code === '00' || $code === '01' || $code === '02') {
        $id = isset($parts[1]) ? trim($parts[1]) : "NO_ID";
        echo "SUCCESS|" . $id;
    } else {
        echo "ERROR|" . $res;
    }
} else if ($action === 'report') {
    // NetGSM Sorgulama Versiyon 2 (HTTP GET)
    // Trailing slash kaldırıldı ve FOLLOWLOCATION eklendi (301 hatası için)
    $bulkid = $_GET['msgid'] ?? "";
    $url = "https://api.netgsm.com.tr/sms/report?usercode=" . urlencode($user) . "&password=" . urlencode($pass) . "&bulkid=" . urlencode($bulkid) . "&type=0&status=100&version=2";
    $raw = netgsmRequest($url);
    $txt = trim((string)$raw);

    // İstemci tarafında parse'i sabitlemek için normalize yanıt:
    // STATUS|<kod>|<hamYanıt>
    // kod: 1=iletildi, 0/4=beklemede, 2/3/11/12/13/14=hata, NA=bulunamadı
    $statusCode = null;
    if (preg_match('/(?:^|[^\d])(11|12|13|14|0|1|2|3|4)(?:[^\d]|$)/', $txt, $m)) {
        $statusCode = $m[1];
    }
    if ($statusCode === null || $statusCode === '') {
        $statusCode = 'NA';
    }
    echo "STATUS|" . $statusCode . "|" . $txt;
} else {
    $xml = '<?xml version="1.0" encoding="UTF-8"?><mainbody><header><usercode>' . $user . '</usercode><password>' . $pass . '</password><stip>1</stip><view>1</view></header></mainbody>';
    echo netgsmRequest('https://api.netgsm.com.tr/balance', true, $xml);
}