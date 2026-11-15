import json, time, urllib.request

URL = "https://spamshield-k6xd.onrender.com/predict"
BODY = json.dumps({"text": "WINNER!! Claim your free prize now, call 0900", "threshold": 0.5}).encode()

times = []
for i in range(20):
    req = urllib.request.Request(URL, BODY, {"Content-Type": "application/json"})
    start = time.time()
    urllib.request.urlopen(req).read()
    times.append((time.time() - start) * 1000)

times.sort()
print("Requests:", len(times))
print("Average ms:", round(sum(times) / len(times)))
print("Median ms:", round(times[len(times) // 2]))
print("Fastest ms:", round(times[0]))
print("Slowest ms:", round(times[-1]))