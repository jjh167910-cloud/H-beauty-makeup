#!/usr/bin/env python3
"""One real hosted-neural smoke test using entirely synthetic schematic faces.

Does not prove human photographic quality or identity preservation.
No real user photos, and never logs the base64 images.
"""
import base64
import io
import json
import urllib.request
import urllib.error
from PIL import Image, ImageDraw

BASE="https://h-beauty-neural-makeup-studio-p8au6h.v2.appdeploy.ai"
def post(url,payload):
    req=urllib.request.Request(url,data=json.dumps(payload).encode(),headers={"Content-Type":"application/json"},method="POST")
    try:
        with urllib.request.urlopen(req,timeout=180) as response:
            return response.status,json.loads(response.read())
    except urllib.error.HTTPError as e:
        return e.code,{"error":e.read(2000).decode("utf-8","replace")}
def face(style):
    out=Image.new("RGB",(320,400),"#F5F3EF")
    d=ImageDraw.Draw(out)
    d.ellipse((34,10,287,373),fill="#49392f")
    d.ellipse((65,40,256,345),fill="#bd8c72")
    d.arc((78,138,149,181),180,350,fill="#30241f",width=8)
    d.arc((172,138,242,181),180,350,fill="#30241f",width=8)
    d.ellipse((110,151,126,158),fill="#241a1a")
    d.ellipse((202,151,218,158),fill="#241a1a")
    d.line((157,160,146,245,168,255),fill="#805a4d",width=7)
    d.ellipse((123,275,207,296),fill="#963b53" if style else "#915f55")
    if style:
        d.arc((81,129,148,179),190,355,fill="#302228",width=13)
        d.arc((171,129,242,179),190,355,fill="#302228",width=13)
        d.ellipse((64,232,106,264),fill="#bc6e74")
        d.ellipse((220,232,260,264),fill="#bc6e74")
    f=io.BytesIO();out.save(f,format="PNG")
    return {"data":base64.b64encode(f.getvalue()).decode(),"mimeType":"image/png"}
with urllib.request.urlopen(BASE+"/api/neural-info",timeout=30) as r:
    info=json.loads(r.read())
assert info.get("automatic") is True
assert info.get("photorealismCertified") is False
code,data=post(BASE+"/api/transfer",{"source":face(False),"reference":face(True),"preset":"reference","consent":True})
print(json.dumps({"status":code,"has_image":bool(data.get("image",{}).get("data")),"model":data.get("model"),"mime":data.get("image",{}).get("mimeType"),"bytes":data.get("image",{}).get("bytes")},ensure_ascii=False))
assert code == 200, f"Neural transfer API failed HTTP {code}: {str(data.get('error'))[:500]}"
img=data.get("image")
assert isinstance(img,dict) and img.get("mimeType","").startswith("image/") and len(img.get("data",""))>100
print("PASS: genuine hosted neural generation returned image bytes on synthetic schematic inputs.")
