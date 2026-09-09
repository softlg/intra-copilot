package com.intra.copilot.persistence;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import java.sql.*;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.postgresql.util.PGobject;
public class PostgresJsonNodeTypeHandler extends BaseTypeHandler<JsonNode> {
 private static final ObjectMapper MAPPER=JsonMapper.builder().findAndAddModules().build();
 @Override public void setNonNullParameter(PreparedStatement ps,int i,JsonNode p,JdbcType t)throws SQLException{PGobject v=new PGobject();v.setType("json");try{v.setValue(MAPPER.writeValueAsString(p));}catch(Exception e){throw new SQLException("Unable to serialize JSON value",e);}ps.setObject(i,v);}
 @Override public JsonNode getNullableResult(ResultSet r,String c)throws SQLException{return parse(r.getString(c));}
 @Override public JsonNode getNullableResult(ResultSet r,int c)throws SQLException{return parse(r.getString(c));}
 @Override public JsonNode getNullableResult(CallableStatement c,int i)throws SQLException{return parse(c.getString(i));}
 private JsonNode parse(String v)throws SQLException{if(v==null)return null;try{return MAPPER.readTree(v);}catch(Exception e){throw new SQLException("Unable to parse JSON value",e);}}
}