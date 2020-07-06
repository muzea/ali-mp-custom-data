const got = require("got").default;
const fs = require("fs");
const $ = require("cheerio");

/**
 *
 * @param {string} name
 */
function fixComponentName(name) {
  return name.replace(/.*\//g, "");
}

async function fetchRawData() {
  const list = JSON.parse(
    (
      await got.get(
        "https://opendocs.alipay.com/api/path-map/002nub?_output_charset=utf-8&_input_charset=utf-8&preview=false"
      )
    ).body
  );
  fs.mkdirSync("content", { recursive: true });
  for (const it of Object.keys(list)) {
    if (it.endsWith("-")) {
      continue;
    }
    if (
      ["/mini/component/", "/mini/component-ext/"].some((prefix) =>
        it.includes(prefix)
      ) &&
      !it.includes("overview")
    ) {
      const code = list[it];
      const resp = (
        await got.get(`https://opendocs.alipay.com/api/content/${code}`)
      ).body;
      fs.writeFileSync(`./content/${fixComponentName(it)}.raw`, resp, {
        encoding: "utf8",
      });
    }
  }
}

/**
 *
 * @param {string} name
 * @param {*} data
 */
function filter(name, data) {
  if (data.result.title.endsWith(" 常见问题")) {
    return false;
  }
  return true;
}

function buildProp(propName, propType, propDefaultValue, propDesc) {
  return {
    name: $(propName).text(),
    description: {
      kind: "markdown",
      value: `${$(propDesc).text()}

type: ${$(propType).text()}

defaultValue: ${$(propDefaultValue).text()}
`,
    },
  };
}

function extractProp(table) {
  const ret = [];
  const trs = $.load(table)("tr");
  let index = 1;
  while (index < trs.length) {
    const tr = trs[index];
    const [propName, propType, propDefaultValue, propDesc] = tr.childNodes;
    ret.push(buildProp(propName, propType, propDefaultValue, propDesc));
    ++index;
  }
  return ret;
}

function extractPropWheelDraw(table) {
  const ret = [];
  const trs = $.load(table)("tr");
  let index = 1;
  while (index < trs.length) {
    const tr = trs[index];
    const [propName, propDesc, propType, propDefaultValue] = tr.childNodes;
    ret.push(buildProp(propName, propType, propDefaultValue, propDesc));
    ++index;
  }
  return ret;
}

function transformData(name, data) {
  const c = {
    name: name,
    description: data.result.catalog.catalogName,
    attributes: [],
  };
  const h = $.load(data.result.text);
  const result = h(".xe-table-wrapper");
  if (result.length === 1) {
    const props =
      name === "wheel-draw"
        ? extractPropWheelDraw(result[0])
        : extractProp(result[0]);
    c.attributes.push(...props);
    return;
  }
  const end = result.length;
  for (let index = 0; index < end; index++) {
    const element = result[index];
    let loopLimit = 3;
    let titleElement = element.previousSibling;
    while (!/^h\d$/.test(titleElement.tagName)) {
      loopLimit--;
      if (loopLimit === 0) {
        break;
      }
      titleElement = titleElement.previousSibling;
    }
    const title = $(titleElement).text();
    if (name === "xxx") {
      // 多 title
      // 对应多个 tag 的场景
      return;
    }
    // 其他组件
    if (title.trim() === "属性") {
      //   console.log(name, title.trim());
      const props = extractProp(element);
      c.attributes.push(...props);
    }
  }
  return c;
}

async function main() {
  await fetchRawData();
  const fileList = fs.readdirSync("content", { encoding: "utf8" });
  const result = [];
  for (const fileName of fileList) {
    if (
      [
        "mg7rvg",
        "idfvg6",
        "rich-text",
        "access",
        "Remax",
        "accessibility",
      ].some((it) => fileName.includes(it))
    ) {
      continue;
    }
    const json = JSON.parse(
      fs.readFileSync(`./content/${fileName}`, { encoding: "utf8" })
    );
    if (filter(fileName, json)) {
      const tag = transformData(fileName.replace(".raw", ""), json);
      tag && result.push(tag);
    }
  }
  fs.writeFileSync(
    "./ali-mp.html-data.json",
    JSON.stringify(
      {
        version: 1.1,
        tags: result,
      },
      null,
      2
    ),
    { encoding: "utf8" }
  );
}

main();
