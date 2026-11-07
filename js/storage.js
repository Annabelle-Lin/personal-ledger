
import { STORAGE_KEY } from "./constants.js";

// 获取所有账单
export function getRecords() {
    try {
        return JSON.parse(
            localStorage.getItem(STORAGE_KEY)
        ) || [];
    } catch (error) {
        console.error("读取账单失败：", error);
        return [];
    }
}

// 保存所有账单
export function saveRecords(records) {
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(records)
        );
        return true;
    } catch (error) {
        console.error("保存失败：", error);
        return false;
    }
}

// 新增账单
export function addRecord(record) {
    const records = getRecords();

    records.push(record);

    if (!saveRecords(records)) {
        throw new Error("新增账单失败");
    }

    return record;
}

// 删除账单
export function deleteRecord(id) {
    const records = getRecords();

    const newRecords = records.filter(
        item => item.id !== id
    );

    if (newRecords.length === records.length) {
        return false;
    }

    return saveRecords(newRecords);
}
