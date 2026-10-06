# AzaharPlus garde ses triches intégrées dans une seule chaîne de 2 Mo, trop
# grande pour MSVC. On la découpe en morceaux recollés au démarrage.
import re, sys

path = sys.argv[1]
src = open(path, encoding="utf-8").read()
m = re.search(r'nlohmann::json::parse\("((?:[^"\\]|\\.)*)"\)', src)
if not m or len(m.group(1)) < 16000:
    sys.exit(0)

parts, cur = [], ""
for tok in re.findall(r'\\u[0-9a-fA-F]{4}|\\.|[^\\]',m.group(1), re.S):
    cur += tok
    if len(cur.encode("utf-8")) >= 15000:
        parts.append(cur)
        cur = ""
parts.append(cur)

body = ",\n".join(f'"{p}"' for p in parts)
repl = ("nlohmann::json::parse([] {\n    static const char* const parts[] = {\n" + body +
        "};\n    std::string s;\n    for (const char* p : parts) s += p;\n    return s;\n}())")
open(path, "w", encoding="utf-8", newline="\n").write(src[:m.start()] + repl + src[m.end():])
