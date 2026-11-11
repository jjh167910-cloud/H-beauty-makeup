"""Halve a float32 .tflite: large float32 constants become float16 with a DEQUANTIZE op in front
(the same layout TensorFlow's float16 post-training quantization writes)."""
import sys, numpy as np, flatbuffers
from ai_edge_litert import schema_py_generated as S
src, dst = sys.argv[1], sys.argv[2]
m = S.ModelT.InitFromObj(S.Model.GetRootAsModel(open(src, 'rb').read(), 0))
g = m.subgraphs[0]
deq = next((i for i, c in enumerate(m.operatorCodes) if max(c.builtinCode, c.deprecatedBuiltinCode) == S.BuiltinOperator.DEQUANTIZE), None)
if deq is None:
    c = S.OperatorCodeT(); c.builtinCode = S.BuiltinOperator.DEQUANTIZE; c.deprecatedBuiltinCode = S.BuiltinOperator.DEQUANTIZE; c.version = 2
    m.operatorCodes.append(c); deq = len(m.operatorCodes) - 1
new_ops, n, saved = [], 0, 0
for ti, t in enumerate(list(g.tensors)):
    b = m.buffers[t.buffer]
    if t.type != S.TensorType.FLOAT32 or b.data is None or len(b.data) < 4096: continue
    w = np.frombuffer(bytes(b.data), np.float32)
    h = S.TensorT(); h.shape = list(t.shape); h.type = S.TensorType.FLOAT16; h.name = (t.name or b'') + b'_fp16'
    nb = S.BufferT(); nb.data = np.frombuffer(w.astype(np.float16).tobytes(), np.uint8); m.buffers.append(nb); h.buffer = len(m.buffers) - 1
    g.tensors.append(h)
    b.data = None                                      # the float32 tensor is now computed, not stored
    op = S.OperatorT(); op.opcodeIndex = deq; op.inputs = [len(g.tensors) - 1]; op.outputs = [ti]
    new_ops.append(op); n += 1; saved += w.nbytes // 2
g.operators = new_ops + g.operators
fb = flatbuffers.Builder(1 << 20); fb.Finish(m.Pack(fb), file_identifier=b'TFL3')
open(dst, 'wb').write(fb.Output()); print('tensors', n, 'saved MB', round(saved / 1e6, 1))
